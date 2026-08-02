import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { PaymentApiClient } from './payment-api.client';

/** A resposta de `GET /customers/{id}/access-status`, só o que usamos. */
interface AccessStatusResponse {
  allowed: boolean;
  reasons?: string[];
  customBlockMessage?: string | null;
  summary?: {
    overdueCharges?: number;
    totalOverdueValue?: number;
    oldestOverdueDays?: number;
  };
}

export interface SituacaoAcesso {
  liberado: boolean;
  motivo?: string;
  valorEmAberto?: number;
  faturasVencidas?: number;
  diasEmAtraso?: number;
}

/** Liberado é sempre a resposta segura — e é a resposta de todo caminho de dúvida. */
const LIBERADO: SituacaoAcesso = { liberado: true };

const CHAVE = (customerId: string) => `pay:acesso:${customerId}`;

/**
 * O cliente pode usar o sistema?
 *
 * Quem responde é o gateway, que conhece as cobranças vencidas. O que este
 * serviço acrescenta é **cache** e, sobretudo, **fail-open**.
 *
 * ## Fail-open é inegociável
 *
 * Toda dúvida responde "liberado": gateway fora do ar, timeout, cliente sem
 * customer, Redis indisponível, resposta que não entendemos. O prejuízo de
 * deixar um inadimplente trabalhar por um dia é menor que o de travar **todos**
 * os adimplentes numa queda nossa — e a segunda falha é a que gera ligação de
 * cliente furioso e perda de confiança no produto.
 *
 * Não existe um único `catch` aqui que devolva bloqueado. Se um dia existir,
 * é um defeito.
 */
@Injectable()
export class AcessoService {
  private readonly logger = new Logger(AcessoService.name);
  private readonly ttlSegundos: number;

  constructor(
    private readonly api: PaymentApiClient,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // O mesmo TTL que a política do gateway usa. Cinco minutos é o equilíbrio
    // entre não martelar a API a cada request e o cliente que acabou de pagar
    // não esperar muito para voltar.
    this.ttlSegundos = 5 * 60;
  }

  /**
   * O bloqueio está ligado?
   *
   * Duas condições, e as duas precisam ser verdadeiras: a integração
   * configurada **e** o interruptor explicitamente ligado. Ligar por acidente é
   * o que este método existe para impedir.
   */
  get ativo(): boolean {
    return this.api.configured && this.config.get<boolean>('PAYMENT_BLOQUEIO_ATIVO', false) === true;
  }

  /**
   * A situação de um cliente do gateway.
   *
   * Cliente recém-criado, sem cobrança nenhuma, responde `allowed: true` do
   * lado deles — então não é preciso exceção para cliente novo.
   */
  async situacao(customerId: string | null | undefined): Promise<SituacaoAcesso> {
    // Sem customer não há o que consultar. Cliente que ainda não foi
    // sincronizado não pode ser tratado como devedor: ele nunca foi cobrado.
    if (!customerId || !this.ativo) return LIBERADO;

    const cacheado = await this.lerCache(customerId);
    if (cacheado) return cacheado;

    try {
      const resposta = await this.api.get<AccessStatusResponse>(
        `/customers/${customerId}/access-status`,
      );
      const situacao = this.traduzir(resposta);
      await this.gravarCache(customerId, situacao);
      return situacao;
    } catch (err) {
      // **Fail-open.** Registrado como aviso, não erro: é um caminho previsto,
      // e transformá-lo em erro faria o alerta perder o significado.
      this.logger.warn(
        `Não deu para conferir o acesso do cliente ${customerId} (${(err as Error).message}) — liberando`,
      );
      return LIBERADO;
    }
  }

  /**
   * Esquece o que sabíamos de um cliente.
   *
   * Chamado quando uma fatura é paga (webhook, conciliação ou baixa manual):
   * sem isso, quem acabou de pagar esperaria o TTL para voltar a trabalhar — e
   * cinco minutos olhando uma tela travada depois de pagar é a pior experiência
   * que este sistema pode oferecer.
   */
  async esquecer(customerId: string | null | undefined): Promise<void> {
    if (!customerId) return;
    await this.redis.del(CHAVE(customerId)).catch(() => undefined);
  }

  // ------------------------------------------------------------------ interno

  private traduzir(resposta: AccessStatusResponse): SituacaoAcesso {
    if (resposta?.allowed !== false) return LIBERADO;

    return {
      liberado: false,
      motivo:
        resposta.customBlockMessage ||
        resposta.reasons?.join('; ') ||
        'Assinatura em atraso',
      valorEmAberto: resposta.summary?.totalOverdueValue,
      faturasVencidas: resposta.summary?.overdueCharges,
      diasEmAtraso: resposta.summary?.oldestOverdueDays,
    };
  }

  private async lerCache(customerId: string): Promise<SituacaoAcesso | null> {
    try {
      const bruto = await this.redis.get(CHAVE(customerId));
      return bruto ? (JSON.parse(bruto) as SituacaoAcesso) : null;
    } catch {
      // Redis fora não pode bloquear ninguém — segue para a consulta, e se ela
      // também falhar o fail-open resolve.
      return null;
    }
  }

  private async gravarCache(customerId: string, situacao: SituacaoAcesso): Promise<void> {
    await this.redis
      .set(CHAVE(customerId), JSON.stringify(situacao), 'EX', this.ttlSegundos)
      .catch(() => undefined);
  }
}
