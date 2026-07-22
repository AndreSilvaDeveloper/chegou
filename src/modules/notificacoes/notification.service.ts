import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Notificacao } from '../../database/entities';
import { StatusNotificacao } from '../../database/entities/notificacao.entity';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notificacao)
    private readonly notificacaoRepo: Repository<Notificacao>,
    @InjectQueue(QUEUE_NOTIFICATION_DISPATCH)
    private readonly dispatchQueue: Queue,
  ) {}

  async agendarNotificacao(params: Partial<Notificacao>) {
    const notificacao = this.notificacaoRepo.create({
      ...params,
      status: params.agendadaPara ? StatusNotificacao.AGENDADA : StatusNotificacao.PENDENTE,
    });
    
    await this.notificacaoRepo.save(notificacao);

    // Adiciona na fila do BullMQ
    const delay = params.agendadaPara ? Math.max(0, params.agendadaPara.getTime() - Date.now()) : 0;
    
    await this.dispatchQueue.add(
      'dispatch',
      { notificacaoId: notificacao.id },
      { 
        delay,
        priority: notificacao.prioridade || 5, // BullMQ: lower number = higher priority
      }
    );

    this.logger.log(`Notificação ${notificacao.id} enfileirada (Delay: ${delay}ms)`);
    return notificacao;
  }

  async listar(tenantId: string, query: import('./dto/query-notifications.dto').QueryNotificationsDto) {
    const { status, tipo, q, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.notificacaoRepo.createQueryBuilder('notif')
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

    const result = await qb.getRawMany();
    
    const stats = {
      total: 0,
      pendentes: 0,
      enviadas: 0,
      falhas: 0,
      canceladas: 0,
    };

    for (const row of result) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status === StatusNotificacao.PENDENTE || row.status === StatusNotificacao.AGENDADA || row.status === StatusNotificacao.ENVIANDO) {
        stats.pendentes += count;
      } else if (row.status === StatusNotificacao.ENVIADA) {
        stats.enviadas += count;
      } else if (row.status === StatusNotificacao.FALHA) {
        stats.falhas += count;
      } else if (row.status === StatusNotificacao.CANCELADA) {
        stats.canceladas += count;
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

    await this.dispatchQueue.add(
      'dispatch',
      { notificacaoId: notif.id },
      { priority: notif.prioridade || 5 }
    );

    return { success: true };
  }
}
