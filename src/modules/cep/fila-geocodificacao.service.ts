import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { QUEUE_GEOCODIFICACAO } from '../../queues/queues.module';
import { GeocodingService } from './geocoding.service';

export interface JobGeocodificar {
  tenantId: string;
}

/**
 * Agenda a geocodificação de um condomínio.
 *
 * **Fila, e não chamada no salvamento.** Duas razões, e as duas doem sem ela:
 *
 * 1. O Nominatim aceita 1 requisição por segundo. Um endereço pode gastar duas
 *    chamadas, então resolver em linha somaria segundos ao `PATCH` — e o
 *    superadmin cadastrando dez condomínios sentiria cada um deles.
 * 2. Provedor fora do ar deixaria o cadastro sem coordenada **para sempre**,
 *    porque não haveria nada para reprocessar. Aqui o BullMQ repete sozinho.
 *
 * O `jobId` é o id do condomínio: salvar o endereço três vezes seguidas
 * (corrigindo o número, depois o complemento) enfileira **um** trabalho, não
 * três. É a mesma disciplina de idempotência da emissão de cobrança.
 */
@Injectable()
export class FilaGeocodificacaoService {
  private readonly logger = new Logger(FilaGeocodificacaoService.name);

  constructor(
    @InjectQueue(QUEUE_GEOCODIFICACAO) private readonly fila: Queue<JobGeocodificar>,
  ) {}

  /**
   * Enfileira, sem nunca derrubar quem chamou.
   *
   * Redis fora do ar não pode impedir alguém de salvar o endereço do próprio
   * condomínio: a coordenada é um enfeite do mapa, o endereço é o cadastro.
   */
  async agendar(tenantId: string): Promise<void> {
    try {
      await this.fila.add(
        'geocodificar',
        { tenantId },
        {
          jobId: `geo:${tenantId}`,
          // Sem isto, o `jobId` repetido seria recusado enquanto o anterior
          // ainda estivesse no histórico — e o endereço novo nunca seria
          // resolvido.
          removeOnComplete: true,
          removeOnFail: true,
          // Um respiro antes de rodar: quem corrige o número logo depois de
          // salvar cai no mesmo job em vez de gerar outro.
          delay: 5000,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Não deu para agendar a geocodificação de ${tenantId}: ${(err as Error).message}`,
      );
    }
  }
}

/**
 * Resolve e grava a coordenada do condomínio.
 *
 * **Concorrência 1**, de propósito: é o que mantém o ritmo do Nominatim mesmo
 * com muitos condomínios na fila. Não há pressa — ninguém está esperando esta
 * resposta numa tela.
 */
@Processor(QUEUE_GEOCODIFICACAO, { concurrency: 1 })
export class GeocodificacaoProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(GeocodificacaoProcessor.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly geocoding: GeocodingService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  onModuleInit(): void {
    // Mesma disciplina dos outros workers: numa réplica que só atende HTTP,
    // ligar o worker multiplicaria quem consome a fila — e aqui isso também
    // multiplicaria as chamadas ao Nominatim, que é o que a política proíbe.
    if (this.config.get<string>('WORKER_ENABLED', 'true') === 'false') {
      void this.worker?.close();
      this.logger.log('WORKER_ENABLED=false — esta instância não geocodifica');
    }
  }

  async process(job: Job<JobGeocodificar>): Promise<void> {
    const { tenantId } = job.data;
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) return;

    const achado = await this.geocoding.resolver(tenant);

    // Grava o carimbo mesmo sem achar nada. É ele que separa "nunca tentamos"
    // de "tentamos e este endereço não existe em base nenhuma" — sem isso, a
    // única leitura possível de latitude NULL seria a primeira.
    tenant.latitude = achado?.latitude ?? null;
    tenant.longitude = achado?.longitude ?? null;
    tenant.geoPrecisao = achado?.precisao ?? null;
    tenant.geoAtualizadoEm = new Date();
    await this.tenantRepo.save(tenant);

    if (achado) {
      this.logger.log(
        `${tenant.nome}: ${achado.latitude}, ${achado.longitude} (${achado.precisao})`,
      );
    } else {
      this.logger.warn(`${tenant.nome}: nenhum provedor achou o endereço`);
    }
  }
}
