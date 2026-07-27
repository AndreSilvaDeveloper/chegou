import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { QUEUE_NOTIFICATION_DISPATCH } from '../../queues/queues.module';
import { Encomenda, Notificacao } from '../../database/entities';
import { StatusNotificacao, TipoNotificacao } from '../../database/entities/notificacao.entity';
import { OpenwaService, WhatsappNumberNotFoundError } from '../openwa/openwa.service';

/**
 * Quanto a trava do condomínio vale. Precisa cobrir o pior envio possível
 * (três chamadas ao gateway, cada uma com o timeout do OpenWaClient) — se
 * expirar no meio, outro job entraria no mesmo número.
 */
const TTL_TRAVA_MS = 90_000;

/** Espera antes de tentar de novo quando o condomínio está ocupado. */
const REPESCAGEM_MS = 3_000;
const REPESCAGEM_JITTER_MS = 4_000;

/** Solta a trava só se ela ainda for nossa (a anterior pode ter expirado). */
const LUA_DESTRAVAR = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * Consome a fila unificada de disparos e envia via OpenWA (número do próprio condomínio).
 * O texto já vem renderizado (`notificacao.conteudo`); o agendamento anti-bloqueio
 * (intervalo + jitter + janela + cota) é feito no enfileiramento — aqui só envia quando o job dispara.
 *
 * **Concorrência**: o worker processa vários jobs ao mesmo tempo, mas uma trava
 * no Redis garante **um envio por vez por condomínio**. Antes era `concurrency: 1`
 * global: um condomínio com o gateway lento segurava a fila de todos os outros,
 * e o teto da plataforma inteira era uma mensagem por vez. A serialização que
 * importa para não ser bloqueado é por número, não por plataforma.
 */
@Processor(QUEUE_NOTIFICATION_DISPATCH, {
  // Valor real vem de NOTIFICATION_CONCURRENCY no onModuleInit (o decorator é
  // avaliado antes de o ConfigService existir).
  concurrency: 1,
})
export class NotificationDispatcherService extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @InjectRepository(Notificacao) private readonly notificacaoRepo: Repository<Notificacao>,
    @InjectRepository(Encomenda) private readonly encomendaRepo: Repository<Encomenda>,
    private readonly openwa: OpenwaService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  onModuleInit(): void {
    // Réplica de API que só atende HTTP não deve consumir a fila: sem isso,
    // escalar a web horizontalmente multiplicaria os workers sem querer.
    if (this.config.get<string>('WORKER_ENABLED', 'true') === 'false') {
      void this.worker.close();
      this.logger.log('WORKER_ENABLED=false — esta instância não consome a fila de disparo');
      return;
    }

    const concorrencia = this.config.get<number>('NOTIFICATION_CONCURRENCY', 15);
    this.worker.concurrency = concorrencia;
    this.logger.log(`Worker de disparo ativo (concorrência ${concorrencia}, 1 envio por condomínio)`);
  }

  private travaKey(tenantId: string): string {
    return `wa:envio:${tenantId}`;
  }

  async process(job: Job<{ notificacaoId: string }>, token?: string): Promise<void> {
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

    const marca = randomUUID();
    const chave = this.travaKey(notificacao.tenantId);
    const pegou = await this.redis.set(chave, marca, 'PX', TTL_TRAVA_MS, 'NX');

    if (!pegou) {
      // Outro envio deste condomínio está em voo. Volta para a fila como
      // atrasado (DelayedError não gasta tentativa — não houve falha nenhuma).
      const espera = REPESCAGEM_MS + Math.floor(Math.random() * REPESCAGEM_JITTER_MS);
      if (!token) throw new Error('Job sem token: não dá para reagendar com segurança');
      await job.moveToDelayed(Date.now() + espera, token);
      throw new DelayedError();
    }

    const inicio = Date.now();
    try {
      await this.enviar(notificacao);
      this.logger.log(`Notificação ${notificacaoId} enviada via OpenWA em ${Date.now() - inicio}ms`);
    } finally {
      await this.redis.eval(LUA_DESTRAVAR, 1, chave, marca).catch(() => undefined);
    }
  }

  /** Envio propriamente dito, já com a trava do condomínio na mão. */
  private async enviar(notificacao: Notificacao): Promise<void> {
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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const numeroInvalido = error instanceof WhatsappNumberNotFoundError;

      if (numeroInvalido) {
        this.logger.warn(
          `Notificação ${notificacao.id} falhou: número ${notificacao.destinatarioTelefone} não está no WhatsApp` +
            (notificacao.destinatarioNome ? ` (${notificacao.destinatarioNome})` : ''),
        );
      } else {
        this.logger.error(`Erro ao enviar notificação ${notificacao.id}: ${msg}`);
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
