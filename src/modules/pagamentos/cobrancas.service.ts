import { Injectable, Logger } from '@nestjs/common';
import { PaymentApiClient, PaymentApiError } from './payment-api.client';
import type { ChargeResponse, ChargeStatus, CreateChargeRequest } from './payment-api.types';

/** O que precisa ser cobrado, do jeito que o gateway entende. */
export interface CobrancaParaEmitir {
  customerId: string;
  /** Em reais, com duas casas. */
  valor: number;
  /** `YYYY-MM-DD`. */
  vencimento: string;
  descricao: string;
  /**
   * O id da **nossa** fatura.
   *
   * É a correlação que sobrevive a tudo: se perdermos o `cobranca_id`, o
   * webhook ainda diz de qual fatura ele fala.
   */
  referenciaExterna: string;
  /** Gerada e persistida pelo chamador — **nunca** aqui. Ver `AssinaturaCobrancasService`. */
  idempotencyKey: string;
  /**
   * O código do cupom, quando houver.
   *
   * **`valor` acima é o valor SEM o cupom.** É o gateway que desconta; mandar o
   * valor já descontado junto do código aplicaria o desconto duas vezes.
   */
  cupomCodigo?: string;
}

/** O que sobra de uma cobrança depois de traduzida. */
export interface CobrancaEmitida {
  cobrancaId: string;
  asaasId: string | null;
  invoiceUrl: string | null;
  statusGateway: ChargeStatus;
  valor: number;
}

/**
 * As operações de cobrança na Payment API.
 *
 * Como o resto deste módulo, **não conhece fatura**: recebe o que cobrar e
 * devolve o que aconteceu. Quem lê e grava a fatura é
 * `AssinaturaCobrancasService`, no módulo Assinaturas.
 *
 * A chave de idempotência **chega pronta**. Ela não é gerada aqui de propósito:
 * gerada no serviço, um retry criaria chave nova e cobraria o cliente duas
 * vezes. Ela precisa nascer junto do registro que sobrevive ao processo — a
 * fatura.
 */
@Injectable()
export class CobrancasService {
  private readonly logger = new Logger(CobrancasService.name);

  constructor(private readonly api: PaymentApiClient) {}

  get ligado(): boolean {
    return this.api.configured;
  }

  /**
   * Emite a cobrança: um link só, e o cliente escolhe PIX, boleto ou cartão.
   *
   * `/charges/undefined` em vez de `/charges/pix`: escolher o método por ele
   * significaria decidir por um condomínio inteiro como o síndico prefere
   * pagar — e trocar depois exigiria cancelar e reemitir.
   *
   * **409 é sucesso.** Ele é a resposta de um retry idempotente que deu certo:
   * a cobrança já existe do outro lado, com a nossa chave. Tratar como erro
   * marcaria a fatura como falha tendo cobrança viva no gateway — o pior dos
   * dois mundos, porque o cliente recebe o link e nós achamos que não emitimos.
   */
  async emitir(dados: CobrancaParaEmitir): Promise<CobrancaEmitida> {
    const corpo: CreateChargeRequest = {
      customerId: Number(dados.customerId),
      value: dados.valor,
      dueDate: dados.vencimento,
      description: dados.descricao,
      externalReference: dados.referenciaExterna,
      origin: 'API',
      ...(dados.cupomCodigo ? { couponCode: dados.cupomCodigo } : {}),
    };

    try {
      const charge = await this.api.post<ChargeResponse>(
        '/charges/undefined',
        corpo,
        dados.idempotencyKey,
      );
      return this.traduzir(charge);
    } catch (err) {
      if (err instanceof PaymentApiError && err.status === 409) {
        this.logger.warn(
          `Cobrança da fatura ${dados.referenciaExterna} já existia (replay de idempotência); lendo a que está lá`,
        );
        const existente = this.charge(err.body);
        if (existente) return this.traduzir(existente);

        // A API devolveu 409 sem o corpo da cobrança. Procurar pela referência
        // externa é a saída — sem ela, o retry seguinte veria "pendente" e
        // tentaria emitir de novo, agora com o risco de a chave ter expirado.
        const achada = await this.procurarPorReferencia(dados.referenciaExterna);
        if (achada) return this.traduzir(achada);
      }
      throw err;
    }
  }

  /** Consulta o estado atual — a base da conciliação (fase 4). */
  async consultar(cobrancaId: string): Promise<CobrancaEmitida> {
    return this.traduzir(await this.api.get<ChargeResponse>(`/charges/${cobrancaId}`));
  }

  /**
   * Acha a cobrança pelo id da nossa fatura.
   *
   * Serve para o caso em que a cobrança foi criada mas não chegamos a gravar o
   * id — divergência de valor, resposta perdida. Sem isto, uma cobrança viva
   * ficaria órfã do outro lado, e o cliente poderia pagá-la.
   */
  async consultarPorReferencia(referencia: string): Promise<CobrancaEmitida | null> {
    const achada = await this.procurarPorReferencia(referencia);
    return achada ? this.traduzir(achada) : null;
  }

  /**
   * Cancela a cobrança no gateway.
   *
   * Aceito só em `PENDING`, `CONFIRMED` e `OVERDUE` do lado deles; qualquer
   * outro estado responde 409, que aqui **não** é erro: cobrança que já não dá
   * para cancelar é cobrança que não vai mais ser paga por engano, que é
   * exatamente o que o cancelamento queria garantir.
   */
  async cancelar(cobrancaId: string): Promise<void> {
    try {
      await this.api.delete<ChargeResponse>(`/charges/${cobrancaId}`);
    } catch (err) {
      if (err instanceof PaymentApiError && err.status === 409) {
        this.logger.warn(`Cobrança ${cobrancaId} não estava cancelável; seguindo`);
        return;
      }
      throw err;
    }
  }

  /**
   * Marca a cobrança como recebida fora do gateway (PIX na conta, dinheiro).
   *
   * Também exige `Idempotency-Key` — a mesma disciplina da emissão, e pelo
   * mesmo motivo: um retry depois de timeout não pode dar duas baixas.
   */
  async receberEmDinheiro(cobrancaId: string, idempotencyKey: string): Promise<void> {
    try {
      await this.api.post<ChargeResponse>(
        `/charges/${cobrancaId}/received-in-cash`,
        undefined,
        idempotencyKey,
      );
    } catch (err) {
      // 409 aqui é "já não está PENDING/OVERDUE" — ou seja, já foi recebida.
      // O desfecho pretendido já vale.
      if (err instanceof PaymentApiError && err.status === 409) return;
      throw err;
    }
  }

  // ------------------------------------------------------------------ auxílio

  private async procurarPorReferencia(referencia: string): Promise<ChargeResponse | null> {
    try {
      const pagina = await this.api.get<{ content: ChargeResponse[] }>(
        `/charges?size=50&sort=createdAt,desc`,
      );
      return pagina.content?.find((c) => c.externalReference === referencia) ?? null;
    } catch (err) {
      this.logger.warn(`Busca da cobrança ${referencia} falhou: ${(err as Error).message}`);
      return null;
    }
  }

  /** O corpo do 409 pode trazer a cobrança do replay, ou não trazer nada útil. */
  private charge(body: unknown): ChargeResponse | null {
    const candidato = body as ChargeResponse | null;
    return candidato && typeof candidato === 'object' && 'id' in candidato ? candidato : null;
  }

  private traduzir(charge: ChargeResponse): CobrancaEmitida {
    return {
      cobrancaId: String(charge.id),
      asaasId: charge.asaasId ?? null,
      invoiceUrl: charge.invoiceUrl ?? null,
      statusGateway: charge.status,
      valor: Number(charge.value),
    };
  }
}
