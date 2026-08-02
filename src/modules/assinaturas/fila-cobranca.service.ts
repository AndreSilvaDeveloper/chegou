import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { QUEUE_COBRANCA_EMISSAO } from '../../queues/queues.module';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import { ConciliacaoService } from './conciliacao.service';

/** `faturaId` só existe no job de emissão; o de conciliação varre sozinho. */
interface JobCobranca {
  faturaId?: string;
}

/** Nomes dos dois trabalhos que passam por esta fila. */
const JOB_EMITIR = 'emitir';
const JOB_CONCILIAR = 'conciliar';

/** De hora em hora — a mesma latência que o "pull de eventos" do plano cobriria. */
const INTERVALO_CONCILIACAO_MS = 60 * 60 * 1000;

/**
 * Enfileira a emissão das cobranças.
 *
 * **Gerar a fatura não pode depender de rede.** A geração mensal percorre todos
 * os clientes e grava o que cada um deve; se ela também emitisse as cobranças em
 * linha, um gateway lento transformaria o fechamento do mês numa requisição de
 * vários minutos, e um gateway fora derrubaria o lote inteiro — perdendo o
 * faturamento por um timeout.
 *
 * Com a fila, a fatura nasce sempre e a cobrança vai atrás, com retry.
 */
@Injectable()
export class FilaCobrancaService implements OnModuleInit {
  private readonly logger = new Logger(FilaCobrancaService.name);

  constructor(
    @InjectQueue(QUEUE_COBRANCA_EMISSAO) private readonly fila: Queue<JobCobranca>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Agenda a conciliação horária.
   *
   * **Repeatable do BullMQ, não `@Cron`**: o repeatable é coordenado pelo Redis,
   * então duas réplicas produzem **uma** execução por hora. Com um cron em
   * processo, cada réplica rodaria a sua — e a conciliação consultaria o gateway
   * pelas mesmas faturas duas vezes.
   *
   * O `jobId` fixo faz o reagendamento substituir o anterior, em vez de
   * acumular um agendamento novo a cada deploy.
   */
  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('WORKER_ENABLED', 'true') === 'false') return;

    await this.fila.add(
      JOB_CONCILIAR,
      {},
      {
        jobId: 'conciliacao-horaria',
        repeat: { every: INTERVALO_CONCILIACAO_MS },
        removeOnComplete: true,
      },
    );
  }

  /**
   * Põe as faturas na fila.
   *
   * O `jobId` é o id da fatura: BullMQ recusa job repetido com o mesmo id, então
   * gerar duas vezes (ou rodar a varredura junto de uma emissão manual) não
   * enfileira a mesma cobrança duas vezes. É a primeira das três camadas de
   * idempotência — as outras duas estão em `AssinaturaCobrancasService`.
   */
  async enfileirar(faturaIds: string[]): Promise<void> {
    if (!faturaIds.length) return;

    await this.fila.addBulk(
      faturaIds.map((faturaId) => ({
        name: JOB_EMITIR,
        data: { faturaId },
        // **Sem `:` no jobId** — o BullMQ o recusa (ele usa `:` como separador
        // das próprias chaves no Redis). O prefixo existe para o job ser
        // reconhecível na fila; o hífen faz o mesmo trabalho.
        opts: { jobId: `emissao-${faturaId}` },
      })),
    );
    this.logger.log(`${faturaIds.length} cobrança(s) na fila de emissão`);
  }
}

/**
 * O worker que emite.
 *
 * Erro **não** é relançado: a falha já virou estado na fatura
 * (`cobranca_status = 'erro'` com o motivo), que é o que a tela lê. Relançar
 * faria o BullMQ repetir cinco vezes uma emissão que falhou por cliente sem
 * documento — algo que nenhuma repetição conserta — e ainda encheria a fila
 * morta de ruído que ninguém consulta.
 *
 * O que merece repetição (rede, 5xx) já é repetido dentro do `PaymentApiClient`.
 */
@Processor(QUEUE_COBRANCA_EMISSAO, { concurrency: 4 })
export class EmissaoCobrancaProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(EmissaoCobrancaProcessor.name);

  constructor(
    private readonly cobrancas: AssinaturaCobrancasService,
    private readonly conciliacao: ConciliacaoService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onModuleInit(): void {
    // Mesma disciplina do worker de notificação: numa réplica que só atende
    // HTTP, ligar o worker multiplicaria quem consome a fila.
    if (this.config.get<string>('WORKER_ENABLED', 'true') === 'false') {
      void this.worker?.close();
      this.logger.log('WORKER_ENABLED=false — esta instância não emite cobranças');
    }
  }

  async process(job: Job<JobCobranca>): Promise<void> {
    if (job.name === JOB_CONCILIAR) {
      await this.conciliacao.rodarAgendada();
      return;
    }

    const faturaId = job.data.faturaId;
    if (!faturaId) return;

    const resultado = await this.cobrancas.emitir(faturaId);
    if (!resultado.ok) {
      this.logger.warn(`Fatura ${faturaId} sem cobrança: ${resultado.detalhe}`);
    }
  }
}
