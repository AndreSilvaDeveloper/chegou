import {
  AssinaturaFatura,
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';

/**
 * O que o **cliente** vê sobre a cobrança da fatura dele.
 *
 * Existe para separar dois vocabulários que estavam se misturando: a fatura tem
 * `cobranca_status`, `cobranca_status_gateway`, `cobranca_erro` e
 * `cobranca_idempotency_key`, e nada disso é assunto de quem paga. O cliente
 * precisa de uma resposta só: **dá para pagar agora, e por onde?**
 *
 * Também é o que impede a coluna interna de vazar: o controller do cliente
 * devolve este bloco, não a linha da fatura.
 */
export type SituacaoPagamento =
  /** Link no ar: o cliente escolhe PIX, boleto ou cartão na tela do gateway. */
  | { situacao: 'pagavel'; linkPagamento: string }
  /** A cobrança está sendo emitida — a fatura acabou de nascer. */
  | { situacao: 'preparando'; linkPagamento: null }
  /** Não há o que pagar (paga, cancelada, estornada). */
  | { situacao: 'sem_pendencia'; linkPagamento: null }
  /** Emitida sem link, ou falha na emissão: quem resolve é o suporte. */
  | { situacao: 'indisponivel'; linkPagamento: null };

/**
 * A situação de pagamento de uma fatura.
 *
 * A ordem das perguntas importa: **"já está resolvida?" vem antes de "tem
 * link?"**. Uma fatura paga costuma continuar com o `invoiceUrl` gravado, e
 * mostrar "Pagar" nela seria convidar o cliente a pagar duas vezes.
 */
export function situacaoDePagamento(fatura: AssinaturaFatura): SituacaoPagamento {
  const resolvida =
    fatura.status === StatusFatura.PAGA ||
    fatura.status === StatusFatura.CANCELADA ||
    fatura.status === StatusFatura.ESTORNADA;
  if (resolvida) return { situacao: 'sem_pendencia', linkPagamento: null };

  // **Disputa não oferece pagamento.** O link continua vivo no gateway, mas
  // pagar no meio de um chargeback é como se paga duas vezes: se a disputa for
  // resolvida a nosso favor, o valor volta — e o cliente terá pago o mesmo mês
  // duas vezes. Chargeback se resolve com gente, não com botão.
  if (fatura.status === StatusFatura.EM_DISPUTA) {
    return { situacao: 'indisponivel', linkPagamento: null };
  }

  if (fatura.cobrancaStatus === StatusCobranca.EMITIDA && fatura.invoiceUrl) {
    return { situacao: 'pagavel', linkPagamento: fatura.invoiceUrl };
  }

  // Ainda na fila (ou o ambiente não tem gateway): não é erro, é "espere um
  // pouco". Dizer "indisponível" aqui faria o cliente ligar para o suporte por
  // causa de uma emissão que ia terminar em segundos.
  if (
    fatura.cobrancaStatus === StatusCobranca.PENDENTE ||
    fatura.cobrancaStatus === StatusCobranca.DESLIGADA
  ) {
    return { situacao: 'preparando', linkPagamento: null };
  }

  return { situacao: 'indisponivel', linkPagamento: null };
}

/** A frase que a tela do cliente mostra. Uma por situação, sem jargão nosso. */
export const TEXTO_SITUACAO: Record<SituacaoPagamento['situacao'], string> = {
  pagavel: 'Pague por PIX, boleto ou cartão',
  preparando: 'Estamos preparando a cobrança. O link aparece aqui em instantes.',
  sem_pendencia: 'Não há nada a pagar nesta fatura',
  indisponivel: 'Não foi possível gerar o link. Fale com o suporte do Chegou.',
};
