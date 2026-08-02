import { Injectable, Logger } from '@nestjs/common';
import { PaymentApiClient } from './payment-api.client';
import type { Page } from './payment-api.types';

/** `CouponResponse` — só o que a tela e o cálculo usam. */
export interface Cupom {
  id: number;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  scope: 'SUBSCRIPTION' | 'CHARGE';
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  usageCount: number;
  active: boolean;
  /** Derivado por eles: ativo **e** dentro da vigência **e** com uso disponível. */
  currentlyValid: boolean;
}

export interface CriarCupom {
  code: string;
  description?: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  validFrom?: string;
  validUntil?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
}

/** O que `POST /coupons/validate` devolve. Responde 200 mesmo quando inválido. */
export interface ValidacaoCupom {
  valid: boolean;
  message: string | null;
  discountAmount: number | null;
  originalValue: number | null;
  finalValue: number | null;
}

/**
 * Cupons: um proxy fino sobre a Payment API.
 *
 * **O cupom vive lá.** Escopo, vigência, limite global, limite por cliente e a
 * contagem de uso são de lá, e é de lá que sai o desconto de verdade. Guardar
 * uma cópia aqui criaria duas fontes da verdade que divergem no primeiro erro
 * de rede — e a que importa é a que desconta.
 *
 * Por isso este serviço não tem repositório: ele traduz chamadas.
 */
@Injectable()
export class CuponsService {
  private readonly logger = new Logger(CuponsService.name);

  constructor(private readonly api: PaymentApiClient) {}

  get ligado(): boolean {
    return this.api.configured;
  }

  async listar(): Promise<Cupom[]> {
    if (!this.ligado) return [];
    const pagina = await this.api.get<Page<Cupom>>('/coupons?size=100&sort=createdAt,desc');
    return pagina.content ?? [];
  }

  /**
   * Cria um cupom.
   *
   * `scope` é sempre `CHARGE`: nós não usamos `subscriptions` da Payment API —
   * cada fatura vira uma cobrança avulsa. Um cupom de escopo `SUBSCRIPTION`
   * seria criado sem reclamação e nunca se aplicaria a nada.
   */
  criar(dados: CriarCupom): Promise<Cupom> {
    return this.api.post<Cupom>('/coupons', {
      ...dados,
      code: dados.code.toUpperCase(),
      scope: 'CHARGE',
    });
  }

  /** Desativa (a API não apaga: o histórico de uso continua existindo). */
  desativar(id: number): Promise<void> {
    return this.api.delete<void>(`/coupons/${id}`);
  }

  reativar(id: number): Promise<Cupom> {
    return this.api.post<Cupom>(`/coupons/${id}/activate`);
  }

  /**
   * Quanto este cupom tira deste valor, para este cliente.
   *
   * **Não incrementa o uso** — a validação real acontece de novo na hora de
   * aplicar, do lado deles, para não estourar `maxUses` numa corrida. É por
   * isso que a emissão precisa conferir o valor devolvido pela cobrança em vez
   * de confiar nesta resposta.
   *
   * Devolve `null` quando não deu para validar (rede, gateway fora): o chamador
   * trata isso como "sem cupom", e a fatura sai pelo valor cheio. Errar para
   * mais é conserto de um clique; errar para menos é dinheiro que não volta.
   */
  async validar(
    codigo: string,
    customerId: string,
    valor: number,
  ): Promise<ValidacaoCupom | null> {
    if (!this.ligado) return null;

    try {
      return await this.api.post<ValidacaoCupom>('/coupons/validate', {
        couponCode: codigo.toUpperCase(),
        scope: 'CHARGE',
        value: valor,
        customerId: Number(customerId),
      });
    } catch (err) {
      this.logger.warn(`Não deu para validar o cupom ${codigo}: ${(err as Error).message}`);
      return null;
    }
  }
}
