import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Notificacao, Tenant } from '../../database/entities';
import { StatusNotificacao } from '../../database/entities/notificacao.entity';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';
import { DEFAULT_TENANT_CONFIG } from '../admin/dto/config-tenant.dto';
import { AntiBanConfig, DispatchSchedulerService } from './dispatch-scheduler.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notificacao)
    private readonly notificacaoRepo: Repository<Notificacao>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectQueue(QUEUE_NOTIFICATION_DISPATCH)
    private readonly dispatchQueue: Queue,
    private readonly scheduler: DispatchSchedulerService,
  ) {}

  /** Config anti-bloqueio efetiva do condomínio (config_json + defaults). */
  async getAntiBanConfig(tenantId: string): Promise<AntiBanConfig> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const cfg = { ...DEFAULT_TENANT_CONFIG, ...(tenant?.configJson ?? {}) } as typeof DEFAULT_TENANT_CONFIG;
    return {
      intervaloSegundos: cfg.whatsappIntervaloSegundos,
      jitterSegundos: cfg.whatsappJitterSegundos,
      limiteDiario: cfg.whatsappLimiteDiario,
      horarioEnvioInicio: cfg.horarioEnvioInicio,
      horarioEnvioFim: cfg.horarioEnvioFim,
    };
  }

  async agendarNotificacao(params: Partial<Notificacao>) {
    if (!params.tenantId) throw new BadRequestException('tenantId é obrigatório');

    const notificacao = this.notificacaoRepo.create({
      ...params,
      status: StatusNotificacao.PENDENTE,
    });
    await this.notificacaoRepo.save(notificacao);

    // Delay anti-bloqueio (intervalo + jitter + janela + cap), por número do condomínio.
    const cfg = await this.getAntiBanConfig(params.tenantId);
    const schedulerDelay = await this.scheduler.reserve(params.tenantId, cfg);
    const explicitDelay = params.agendadaPara
      ? Math.max(0, params.agendadaPara.getTime() - Date.now())
      : 0;
    const delay = Math.max(schedulerDelay, explicitDelay);

    if (delay > 1000) {
      notificacao.status = StatusNotificacao.AGENDADA;
      notificacao.agendadaPara = new Date(Date.now() + delay);
      await this.notificacaoRepo.save(notificacao);
    }

    await this.dispatchQueue.add(
      'dispatch',
      { notificacaoId: notificacao.id },
      {
        delay,
        priority: notificacao.prioridade || 5, // BullMQ: menor número = maior prioridade
      },
    );

    this.logger.log(`Notificação ${notificacao.id} enfileirada (delay: ${Math.round(delay / 1000)}s)`);
    return notificacao;
  }

  async listar(tenantId: string, query: import('./dto/query-notifications.dto').QueryNotificationsDto) {
    const { status, tipo, q, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.notificacaoRepo.createQueryBuilder('notif')
      .leftJoinAndSelect('notif.morador', 'm')
      .leftJoinAndSelect('m.apartamento', 'a')
      .where('notif.tenant_id = :tenantId', { tenantId })
      .orderBy('notif.createdAt', 'DESC');

    if (status) {
      qb.andWhere('notif.status = :status', { status });
    }
    if (tipo) {
      qb.andWhere('notif.tipo = :tipo', { tipo });
    }
    if (q) {
      qb.andWhere('(notif.destinatario_nome ILIKE :q OR notif.destinatario_telefone ILIKE :q)', { q: `%${q}%` });
    }

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async obterStats(tenantId: string) {
    const qb = this.notificacaoRepo.createQueryBuilder('notif')
      .select('notif.status', 'status')
      .addSelect('COUNT(notif.id)', 'count')
      .where('notif.tenant_id = :tenantId', { tenantId })
      .groupBy('notif.status');

    const result = await qb.getRawMany<{ status: string; count: string }>();

    const stats = {
      total: 0,
      naFila: 0, // pendente + enviando
      agendadas: 0,
      enviadas: 0,
      falhas: 0,
      canceladas: 0,
    };

    for (const row of result) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      switch (row.status) {
        case StatusNotificacao.PENDENTE:
        case StatusNotificacao.ENVIANDO:
          stats.naFila += count;
          break;
        case StatusNotificacao.AGENDADA:
          stats.agendadas += count;
          break;
        case StatusNotificacao.ENVIADA:
          stats.enviadas += count;
          break;
        case StatusNotificacao.FALHA:
          stats.falhas += count;
          break;
        case StatusNotificacao.CANCELADA:
          stats.canceladas += count;
          break;
      }
    }

    return stats;
  }

  async cancelar(tenantId: string, id: string) {
    const notif = await this.notificacaoRepo.findOne({ where: { id, tenantId } });
    if (!notif) throw new NotFoundException('Notificação não encontrada');

    if (notif.status !== StatusNotificacao.PENDENTE && notif.status !== StatusNotificacao.AGENDADA) {
      throw new BadRequestException('Apenas notificações pendentes podem ser canceladas');
    }

    notif.status = StatusNotificacao.CANCELADA;
    await this.notificacaoRepo.save(notif);
    
    return { success: true };
  }

  async reenviar(tenantId: string, id: string) {
    const notif = await this.notificacaoRepo.findOne({ where: { id, tenantId } });
    if (!notif) throw new NotFoundException('Notificação não encontrada');

    if (notif.status !== StatusNotificacao.FALHA) {
      throw new BadRequestException('Apenas notificações com falha podem ser reenviadas');
    }

    notif.status = StatusNotificacao.PENDENTE;
    notif.tentativas = 0;
    notif.erroMensagem = null;
    await this.notificacaoRepo.save(notif);

    const cfg = await this.getAntiBanConfig(tenantId);
    const delay = await this.scheduler.reserve(tenantId, cfg);

    await this.dispatchQueue.add(
      'dispatch',
      { notificacaoId: notif.id },
      { delay, priority: notif.prioridade || 5 },
    );

    return { success: true };
  }
}
