import type { Request } from 'express';

/** O que o guard precisa saber para responder 402 com alguma utilidade. */
export interface SituacaoDeBloqueio {
  liberado: boolean;
  motivo?: string;
  valorEmAberto?: number;
  faturasVencidas?: number;
  diasEmAtraso?: number;
  /** Link do gateway para pagar a fatura mais antiga em aberto, se houver. */
  linkPagamento?: string | null;
  /** Para onde mandar o cliente resolver — muda entre síndico e administradora. */
  telaAssinatura?: string;
}

/**
 * O contrato entre o guard e quem sabe de assinatura.
 *
 * Existe como classe abstrata em `common/` — e não como import direto do
 * módulo Assinaturas — porque o guard é **global** e mora aqui. Sem esta
 * inversão, `common/` passaria a depender de um módulo de domínio, e essa é
 * exatamente a dependência que, uma vez aberta, atrai todas as outras: o
 * próximo guard importaria Encomendas, o seguinte importaria Vagas.
 *
 * A classe abstrata (em vez de uma `interface` + token) serve de token de
 * injeção sozinha, sem uma constante `Symbol` para manter em sincronia.
 *
 * Quem implementa é `assinaturas/acesso-assinatura.service.ts`.
 */
export abstract class AcessoAssinaturaService {
  /** O bloqueio está ligado? Desligado, o guard nem consulta. */
  abstract get ativo(): boolean;

  /** A situação de quem está fazendo esta request. */
  abstract situacaoDaRequest(req: Request): Promise<SituacaoDeBloqueio>;
}
