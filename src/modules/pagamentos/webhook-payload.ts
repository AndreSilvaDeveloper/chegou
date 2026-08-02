/**
 * Lê o evento de pagamento sem depender do envelope exato.
 *
 * **O formato do repasse ainda não foi visto na prática.** A Payment API recebe
 * o webhook do Asaas, processa e repassa para uma URL nossa — mas se ela
 * reencaminha o envelope do Asaas cru, embrulha num envelope próprio, ou manda
 * o `WebhookEventResponse` dela, é coisa que só o primeiro evento real conta.
 *
 * Em vez de apostar num formato, o parser **procura os campos**: em qualquer
 * profundidade, em qualquer um dos nomes conhecidos. É a mesma postura que a
 * API deles usa do lado de lá (`@JsonIgnoreProperties(ignoreUnknown = true)`) e
 * pelo mesmo motivo — campo desconhecido nunca pode derrubar o processamento.
 *
 * O payload bruto fica gravado de todo jeito, então um formato que este parser
 * não entenda vira um evento `erro` com o corpo inteiro guardado, e não uma
 * baixa perdida em silêncio.
 */

export interface EventoPagamento {
  /** Id do evento no remetente — a chave da deduplicação. */
  eventoId: string;
  /** `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`... */
  tipo: string | null;
  /** `externalReference`: **o id da nossa fatura**, a correlação que sobrevive a tudo. */
  referenciaExterna: string | null;
  /** Id da cobrança na Payment API, quando vier. */
  cobrancaId: string | null;
  /** Id no Asaas, o outro caminho de correlação. */
  asaasId: string | null;
  /** `ChargeStatus`, quando o evento carrega o estado. */
  status: string | null;
  /**
   * O `status` acima é mesmo o da **cobrança**?
   *
   * Só é `true` quando ele veio de dentro de um objeto `payment`/`charge`. Na
   * raiz de um envelope, `status` pode ser o do **processamento do evento**
   * (`PROCESSED`, `FAILED`, `DLQ` — o `WebhookEventStatus` deles), que não tem
   * nada a ver com o pagamento. Confundir os dois marcaria fatura como paga por
   * causa de um evento processado com sucesso que dizia justamente o contrário.
   *
   * Quando é `false`, quem manda é o gateway: consulta-se a cobrança.
   */
  statusConfiavel: boolean;
}

/** Profundidade máxima da busca — o suficiente para envelope dentro de envelope. */
const PROFUNDIDADE_MAX = 6;

/**
 * Procura a primeira chave que exista, em largura, a partir da raiz.
 *
 * Largura e não profundidade de propósito: o campo do envelope externo importa
 * mais que um homônimo enterrado num objeto aninhado. Um `id` na raiz é o id do
 * evento; um `id` dentro de `payment` é o id da cobrança.
 */
function procurar(raiz: unknown, chaves: string[]): unknown {
  const fila: { valor: unknown; nivel: number }[] = [{ valor: raiz, nivel: 0 }];

  while (fila.length) {
    const { valor, nivel } = fila.shift()!;
    if (!valor || typeof valor !== 'object' || nivel > PROFUNDIDADE_MAX) continue;

    const obj = valor as Record<string, unknown>;
    for (const chave of chaves) {
      const achado = obj[chave];
      if (achado !== undefined && achado !== null && achado !== '') return achado;
    }

    for (const filho of Object.values(obj)) {
      if (filho && typeof filho === 'object') fila.push({ valor: filho, nivel: nivel + 1 });
    }
  }

  return undefined;
}

function texto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string') return valor || null;
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor);
  return null;
}

/**
 * O objeto da cobrança dentro do evento, se houver um.
 *
 * O Asaas manda `payment`; a Payment API pode mandar `charge`. Achando um dos
 * dois, os campos da cobrança são lidos **de dentro dele** — senão um `status`
 * do envelope (o status do *processamento* do evento, não o da cobrança) seria
 * confundido com o estado do pagamento. Foi o erro mais fácil de cometer aqui.
 */
function objetoDaCobranca(corpo: Record<string, unknown>): Record<string, unknown> | null {
  const achado = procurar(corpo, ['payment', 'charge', 'cobranca']);
  return achado && typeof achado === 'object' ? (achado as Record<string, unknown>) : null;
}

/**
 * Traduz o corpo recebido. Devolve `null` quando nem o id do evento existe —
 * sem ele não há como deduplicar, e processar sem dedup é aceitar dar baixa
 * duas vezes.
 */
export function lerEventoPagamento(corpo: unknown): EventoPagamento | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const raiz = corpo as Record<string, unknown>;

  const eventoId = texto(
    procurar(raiz, ['asaasEventId', 'eventId', 'event_id', 'id']),
  );
  if (!eventoId) return null;

  const objeto = objetoDaCobranca(raiz);
  const cobranca = objeto ?? raiz;

  return {
    eventoId,
    tipo: texto(procurar(raiz, ['eventType', 'event', 'type'])),
    referenciaExterna: texto(
      procurar(cobranca, ['externalReference', 'external_reference']),
    ),
    // `processedResourceId` é como a Payment API chama o id local do recurso
    // afetado no `WebhookEventResponse` — vale a mesma coisa que `chargeId`.
    cobrancaId: texto(procurar(cobranca, ['chargeId', 'processedResourceId'])),
    asaasId: texto(procurar(cobranca, ['asaasId', 'processedAsaasId'])),
    status: texto(procurar(cobranca, ['status', 'chargeStatus'])),
    // Sem objeto de cobrança, o `status` que sobrou é de origem incerta. Melhor
    // pagar uma consulta ao gateway do que arriscar marcar uma fatura errada.
    statusConfiavel: objeto !== null,
  };
}
