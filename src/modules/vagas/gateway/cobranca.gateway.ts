/**
 * Contrato do provedor de cobrança.
 *
 * Espelha o desenho do WhatsappGateway: a regra de negócio fala com esta
 * interface, e o provedor concreto é escolhido por configuração. Hoje só existe
 * o adapter manual (registro interno, sem boleto). O AsaasCobrancaAdapter está
 * mapeado e lança NotImplemented — quando a integração entrar, nada além do
 * provider precisa mudar.
 */

export type CobrancaProviderName = 'manual' | 'asaas';

export interface CriarCobrancaParams {
  cobrancaId: string;
  tenantId: string;
  valor: number;
  /** YYYY-MM-DD */
  vencimento: string;
  descricao: string;
  pagador: {
    nome: string;
    documento?: string | null;
    email?: string | null;
    telefoneE164?: string | null;
    /** Id do cliente já criado no provedor, quando houver. */
    providerCustomerId?: string | null;
  };
}

export interface CobrancaEmitida {
  /** Id da cobrança no provedor externo — null quando o controle é interno. */
  providerPaymentId: string | null;
  boletoUrl: string | null;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  /** Resposta crua do provedor, para auditoria. */
  payload: Record<string, unknown> | null;
}

export interface CobrancaGateway {
  readonly provider: CobrancaProviderName;

  /** Se este provedor emite documento de pagamento (boleto/pix). */
  readonly emiteBoleto: boolean;

  criarCobranca(params: CriarCobrancaParams): Promise<CobrancaEmitida>;

  cancelarCobranca(providerPaymentId: string): Promise<void>;
}

export const COBRANCA_GATEWAY = Symbol('COBRANCA_GATEWAY');
