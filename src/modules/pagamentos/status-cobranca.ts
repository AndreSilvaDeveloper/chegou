import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import type { ChargeStatus } from './payment-api.types';

/**
 * O status do gateway virando o nosso.
 *
 * Duas traduções não são óbvias e valem por metade deste arquivo:
 *
 * **`CONFIRMED` já é `paga`.** Confirmado é "o pagamento aconteceu"; liquidado
 * (`RECEIVED`) é "o dinheiro caiu na conta", o que no boleto leva o D+1 do
 * banco. O cliente que pagou não pode ficar bloqueado esperando a compensação
 * — ele fez a parte dele, e o bloqueio da fase 5 lê justamente daqui.
 *
 * **`FAILED` volta para `aberta`.** A tentativa de pagamento falhou (cartão
 * recusado, por exemplo), mas a dívida continua existindo. Marcar como falha
 * própria esconderia uma cobrança que segue em aberto.
 */
const MAPA: Record<ChargeStatus, StatusFatura> = {
  PENDING: StatusFatura.ABERTA,
  CONFIRMED: StatusFatura.PAGA,
  RECEIVED: StatusFatura.PAGA,
  OVERDUE: StatusFatura.VENCIDA,
  REFUNDED: StatusFatura.ESTORNADA,
  REFUND_IN_PROGRESS: StatusFatura.ESTORNADA,
  CANCELED: StatusFatura.CANCELADA,
  FAILED: StatusFatura.ABERTA,
  CHARGEBACK_REQUESTED: StatusFatura.EM_DISPUTA,
  CHARGEBACK_DISPUTE: StatusFatura.EM_DISPUTA,
  AWAITING_CHARGEBACK_REVERSAL: StatusFatura.EM_DISPUTA,
  DUNNING_REQUESTED: StatusFatura.EM_DISPUTA,
  DUNNING_RECEIVED: StatusFatura.EM_DISPUTA,
};

/**
 * Status desconhecido não derruba nada.
 *
 * A API pode ganhar um estado novo antes de nós sabermos. Devolver `null` deixa
 * o chamador guardar o status bruto (`cobranca_status_gateway`) e **não mexer**
 * no nosso — melhor uma fatura com estado antigo e o bruto registrado do que um
 * processamento de webhook que quebra em produção por causa de um enum novo.
 */
export function statusDaFatura(gateway: string): StatusFatura | null {
  return MAPA[gateway as ChargeStatus] ?? null;
}

/**
 * Precedência de estado, para eventos fora de ordem.
 *
 * Webhook chega desordenado: `RECEIVED` pode chegar antes de `CONFIRMED`, e um
 * `PENDING` atrasado pode chegar depois da baixa. **Nunca voltar de `paga` para
 * `aberta` por causa de um evento velho** — a comparação é por precedência, não
 * por ordem de chegada.
 *
 * Terminais de dinheiro (paga, estornada, em disputa, cancelada) ficam acima
 * dos transitórios. Entre eles, o mais alto ganha: um estorno depois da baixa é
 * a informação mais nova que importa; uma disputa é o topo, porque exige gente
 * e não pode ser apagada por evento nenhum.
 */
const PRECEDENCIA: Record<StatusFatura, number> = {
  [StatusFatura.ABERTA]: 0,
  [StatusFatura.VENCIDA]: 1,
  [StatusFatura.CANCELADA]: 2,
  [StatusFatura.PAGA]: 3,
  [StatusFatura.ESTORNADA]: 4,
  [StatusFatura.EM_DISPUTA]: 5,
};

/** O novo status deve substituir o atual? */
export function deveAvancar(atual: StatusFatura, novo: StatusFatura): boolean {
  return PRECEDENCIA[novo] > PRECEDENCIA[atual];
}

/**
 * A cobrança parou de se mexer? — o recorte da conciliação (fase 4).
 *
 * **`paga` não entra.** Parece terminal e não é: um estorno ou um chargeback
 * chega depois da baixa, e é justamente o caso em que perder o webhook custa
 * caro (o cliente aparece como adimplente com o dinheiro devolvido). O que
 * limita o volume da varredura é a **janela de vencimento**, não cortar as
 * pagas — a API pagina por `dueDateFrom/To` de propósito.
 */
export function estadoTerminal(status: StatusFatura): boolean {
  return status === StatusFatura.CANCELADA || status === StatusFatura.ESTORNADA;
}
