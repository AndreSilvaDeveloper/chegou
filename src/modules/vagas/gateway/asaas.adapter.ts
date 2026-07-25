import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CobrancaEmitida,
  CobrancaGateway,
  CobrancaProviderName,
  CriarCobrancaParams,
} from './cobranca.gateway';

/**
 * Asaas — MAPEADO, NÃO IMPLEMENTADO.
 *
 * Este adapter existe para fixar o contrato e as variáveis de ambiente. Nenhum
 * método faz chamada de rede: todos lançam NotImplemented, de propósito, para
 * que ninguém ligue `COBRANCA_PROVIDER=asaas` achando que vai emitir boleto.
 *
 * Para implementar (POST /v3/payments da API do Asaas):
 *  1. garantir/criar o customer e guardar o id em `vagas_locacao.asaas_customer_id`;
 *  2. criar o payment (billingType BOLETO ou PIX) com valor e dueDate;
 *  3. gravar em `vagas_cobrancas`: asaas_payment_id, boleto_url (bankSlipUrl),
 *     linha_digitavel e pix_copia_cola;
 *  4. tratar o webhook PAYMENT_RECEIVED para dar baixa automática.
 *
 * Env necessárias: ASAAS_API_KEY, ASAAS_BASE_URL (sandbox ou produção),
 * ASAAS_WEBHOOK_TOKEN.
 */
@Injectable()
export class AsaasCobrancaAdapter implements CobrancaGateway {
  private readonly logger = new Logger(AsaasCobrancaAdapter.name);

  readonly provider: CobrancaProviderName = 'asaas';
  readonly emiteBoleto = true;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('ASAAS_API_KEY');
  }

  async criarCobranca(params: CriarCobrancaParams): Promise<CobrancaEmitida> {
    this.logger.warn(
      `Tentativa de emitir cobrança ${params.cobrancaId} pelo Asaas — integração não implementada`,
    );
    throw new NotImplementedException(
      'Emissão de boleto pelo Asaas ainda não está disponível. A cobrança segue com controle interno.',
    );
  }

  async cancelarCobranca(_providerPaymentId: string): Promise<void> {
    throw new NotImplementedException(
      'Cancelamento de cobrança no Asaas ainda não está disponível.',
    );
  }
}
