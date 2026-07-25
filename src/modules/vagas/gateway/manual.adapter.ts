import { Injectable } from '@nestjs/common';
import {
  CobrancaEmitida,
  CobrancaGateway,
  CobrancaProviderName,
  CriarCobrancaParams,
} from './cobranca.gateway';

/**
 * Controle interno de cobrança: registra o valor e o vencimento e avisa o
 * responsável, sem emitir boleto. É o provedor padrão enquanto a integração com
 * o Asaas não existe.
 */
@Injectable()
export class ManualCobrancaAdapter implements CobrancaGateway {
  readonly provider: CobrancaProviderName = 'manual';
  readonly emiteBoleto = false;

  async criarCobranca(_params: CriarCobrancaParams): Promise<CobrancaEmitida> {
    return {
      providerPaymentId: null,
      boletoUrl: null,
      linhaDigitavel: null,
      pixCopiaCola: null,
      payload: null,
    };
  }

  async cancelarCobranca(_providerPaymentId: string): Promise<void> {
    // Nada a fazer: não existe cobrança externa para cancelar.
  }
}
