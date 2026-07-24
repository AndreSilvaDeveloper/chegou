import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';
import { Encomenda, Notificacao } from '../../database/entities';
import { StatusNotificacao, TipoNotificacao } from '../../database/entities/notificacao.entity';
import { OpenwaService, WhatsappNumberNotFoundError } from '../openwa/openwa.service';

/**
 * Consome a fila unificada de disparos e envia via OpenWA (número do próprio condomínio).
 * O texto já vem renderizado (`notificacao.conteudo`); o agendamento anti-bloqueio
 * (intervalo + jitter + janela + cap) é feito no enfileiramento — aqui só envia quando o job dispara.
 */
@Processor(QUEUE_NOTIFICATION_DISPATCH, {
  concurrency: 1, // sequencial por segurança extra contra bloqueio
})
export class NotificationDispatcherService extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectRepository(Notificacao) private readonly notificacaoRepo: Repository<Notificacao>,
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    private readonly openwa: OpenwaService,
  ) {
    super();
  }

  async process(job: Job<{ notificacaoId: string }>): Promise<void> {
    const { notificacaoId } = job.data;
    const notificacao = await this.notificacaoRepo.findOne({ where: { id: notificacaoId } });

    if (
      !notificacao ||
      notificacao.status === StatusNotificacao.CANCELADA ||
      notificacao.status === StatusNotificacao.FALHA ||
      notificacao.status === StatusNotificacao.ENVIADA
    ) {
      this.logger.debug(`Notificação ${notificacaoId} ignorada (estado terminal ou inexistente)`);
      return;
    }

    try {
      notificacao.status = StatusNotificacao.ENVIANDO;
      notificacao.tentativas += 1;
      await this.notificacaoRepo.save(notificacao);

      await this.openwa.sendText(
        notificacao.tenantId,
        notificacao.destinatarioTelefone,
        notificacao.conteudo,
      );

      notificacao.status = StatusNotificacao.ENVIADA;
      notificacao.enviadaAt = new Date();
      notificacao.erroMensagem = null;
      await this.notificacaoRepo.save(notificacao);

      await this.aplicarEfeitoColateral(notificacao);
      this.logger.log(`Notificação ${notificacaoId} enviada via OpenWA`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const numeroInvalido = error instanceof WhatsappNumberNotFoundError;

      if (numeroInvalido) {
        this.logger.warn(
          `Notificação ${notificacaoId} falhou: número ${notificacao.destinatarioTelefone} não está no WhatsApp` +
            (notificacao.destinatarioNome ? ` (${notificacao.destinatarioNome})` : ''),
        );
      } else {
        this.logger.error(`Erro ao enviar notificação ${notificacaoId}: ${msg}`);
      }

      // Número inexistente é terminal (não muda numa retentativa) → falha direto.
      if (numeroInvalido || notificacao.tentativas >= notificacao.maxTentativas) {
        notificacao.status = StatusNotificacao.FALHA;
        notificacao.erroMensagem = msg;
        await this.notificacaoRepo.save(notificacao);
        return;
      }

      notificacao.status = StatusNotificacao.PENDENTE;
      notificacao.erroMensagem = msg;
      await this.notificacaoRepo.save(notificacao);
      throw error; // BullMQ faz o retry com backoff
    }
  }

  /** Efeitos pós-envio específicos por tipo (ex.: marcar encomenda como notificada). */
  private async aplicarEfeitoColateral(notificacao: Notificacao): Promise<void> {
    if (
      notificacao.tipo === TipoNotificacao.ENCOMENDA &&
      notificacao.referenciaTipo === 'encomenda' &&
      notificacao.referenciaId
    ) {
      await this.encomendaRepo.update(
        { id: notificacao.referenciaId, tenantId: notificacao.tenantId },
        { status: 'notificado', notificadaAt: new Date() },
      );
    }
  }
}
