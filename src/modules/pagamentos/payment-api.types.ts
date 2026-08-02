/**
 * Espelho dos DTOs da Payment API (`docs/PAYMENT_API_REFERENCE.md`).
 *
 * Só o que nós usamos. O que a API devolve a mais é ignorado de propósito:
 * campo desconhecido nunca pode derrubar o processamento — é a mesma disciplina
 * do `@JsonIgnoreProperties(ignoreUnknown = true)` que eles usam do lado de lá.
 */

/** `POST /auth/login` e `POST /auth/refresh` devolvem o mesmo corpo. */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** Validade do access token, **em milissegundos** (não em segundos). */
  expiresIn: number;
  tokenType: string;
}

/** `POST /customers` e `PUT /customers/{id}`. */
export interface CustomerResponse {
  id: number;
  companyId: number;
  /** Id no Asaas. Pode faltar se a sincronização de lá ainda não terminou. */
  asaasId: string | null;
  name: string;
  document: string;
  email: string | null;
  phone: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
}

/** Corpo de `POST /customers`. `document` é obrigatório lá (`@NotBlank`). */
export interface CreateCustomerRequest {
  name: string;
  document: string;
  email?: string;
  phone?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
}

/**
 * Corpo de `PUT /customers/{id}` — atualização parcial.
 *
 * **`document` não entra**: a API não atualiza documento. Trocar o documento de
 * um cliente exige customer novo lá, e é por isso que guardamos o
 * `documento_enviado` do nosso lado.
 */
export type UpdateCustomerRequest = Omit<CreateCustomerRequest, 'document'>;

/** Envelope de paginação do Spring Data, que a API usa em toda listagem. */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
}

/**
 * O ciclo de vida da cobrança do lado deles.
 *
 * Copiado do enum `ChargeStatus` da referência. Nosso `StatusFatura` é um
 * resumo disto — o mapa de um para o outro mora em `status-cobranca.ts`.
 */
export type ChargeStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'REFUND_IN_PROGRESS'
  | 'CANCELED'
  | 'FAILED'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED';

/** Corpo de `POST /charges/*`. */
export interface CreateChargeRequest {
  customerId: number;
  value: number;
  /** ISO `YYYY-MM-DD`. */
  dueDate: string;
  description?: string;
  externalReference?: string;
  origin?: 'API';
  /** Fase 6. Mandamos o valor **sem** o cupom junto do código, nunca já descontado. */
  couponCode?: string;
}

/** `ChargeResponse` — só os campos que usamos. */
export interface ChargeResponse {
  id: number;
  customerId: number;
  asaasId: string | null;
  value: number;
  dueDate: string;
  status: ChargeStatus;
  externalReference: string | null;
  /** O link único de pagamento (o cliente escolhe o método lá). */
  invoiceUrl: string | null;
  discountAmount?: number | null;
  originalValue?: number | null;
}
