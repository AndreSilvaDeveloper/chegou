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
import { aplicarSaudacao } from './message-template';

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

  async agendarNotificacao(params: Partial<Notificacao>): Promise<Notificacao> {
    const [notificacao] = await this.agendarEmLote([params]);
    return notificacao;
  }

  /**
   * Enfileira várias notificações do **mesmo condomínio** de uma vez.
   *
   * Um aviso para o prédio inteiro são centenas de mensagens. Uma a uma, cada
   * volta custava INSERT + SELECT do tenant + UPDATE + idas ao Redis, tudo em
   * série dentro do request do síndico — a tela travava por segundos. Aqui a
   * config do condomínio é lida uma vez, os slots são reservados em sequência
   * (só Redis, é o que garante o ritmo entre as mensagens) e o banco e a fila
   * levam uma escrita em lote cada.
   */
  async agendarEmLote(itens: Partial<Notificacao>[]): Promise<Notificacao[]> {
    if (itens.length === 0) return [];

    const tenantId = itens[0].tenantId;
    if (!tenantId) throw new BadRequestException('tenantId é obrigatório');
    if (itens.some((i) => i.tenantId !== tenantId)) {
      throw new BadRequestException('agendarEmLote aceita um condomínio por vez');
    }

    const cfg = await this.getAntiBanConfig(tenantId);
    const agora = Date.now();

    const preparadas: { entidade: Notificacao; delay: number }[] = [];
    for (const params of itens) {
      // Delay anti-bloqueio (intervalo + jitter + janela + cota), por número do condomínio.
      const schedulerDelay = await this.scheduler.reserve(tenantId, cfg);
      const explicitDelay = params.agendadaPara
        ? Math.max(0, params.agendadaPara.getTime() - agora)
        : 0;
      const delay = Math.max(schedulerDelay, explicitDelay);
      const agendada = delay > 1000;

      // "Bom dia / Boa tarde / Boa noite" só pode ser decidido AQUI: é o único
      // ponto que conhece a hora real de saída (o conteúdo foi montado quando o
      // porteiro registrou a encomenda, e a fila pode empurrar para amanhã).
      // Mensagem sem o token atravessa sem mudança.
      const conteudo = params.conteudo
        ? aplicarSaudacao(params.conteudo, new Date(agora + delay))
        : params.conteudo;

      preparadas.push({
        delay,
        entidade: this.notificacaoRepo.create({
          ...params,
          conteudo,
          status: agendada ? StatusNotificacao.AGENDADA : StatusNotificacao.PENDENTE,
          agendadaPara: agendada ? new Date(agora + delay) : (params.agendadaPara ?? null),
        }),
      });
    }

    // Um INSERT para o lote todo: o status e o horário já foram decididos acima,
    // então não é preciso gravar e depois voltar para atualizar.
    const salvas = await this.notificacaoRepo.save(preparadas.map((p) => p.entidade));

    await this.dispatchQueue.addBulk(
      salvas.map((notificacao, i) => ({
        name: 'dispatch',
        data: { notificacaoId: notificacao.id },
        opts: {
          delay: preparadas[i].delay,
          priority: notificacao.prioridade || 5, // BullMQ: menor número = maior prioridade
        },
      })),
    );

    const ultimo = Math.round(Math.max(...preparadas.map((p) => p.delay)) / 1000);
    this.logger.log(
      salvas.length === 1
        ? `Notificação ${salvas[0].id} enfileirada (delay: ${ultimo}s)`
        : `${salvas.length} notificações enfileiradas p/ tenant ${tenantId} (última em ${ultimo}s)`,
    );
    return salvas;
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
