import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AcessoAssinaturaService } from './acesso-assinatura.service';

/** Métodos que só leem. Leitura **nunca** é bloqueada. */
const SO_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Rotas que passam mesmo com a assinatura em atraso.
 *
 * **Esta lista é o que impede o bloqueio de se tornar uma armadilha.** Sem
 * `/assinatura`, o cliente bloqueado não conseguiria abrir a tela onde está o
 * link para pagar — e o único caminho de saída seria ligar para o suporte.
 *
 * Comparado contra o caminho **sem** o prefixo global `/api`.
 */
const ISENTAS = [
  // Login precisa funcionar: é onde ele descobre o bloqueio.
  '/auth',
  // A conta e o link de pagamento — a saída do bloqueio.
  '/assinatura',
  '/minha-administradora/assinatura',
  '/health',
  // Webhooks são de outros sistemas, sem usuário logado.
  '/webhooks',
];

/**
 * 402 para quem está com a assinatura em atraso — **só na escrita**.
 *
 * Ordem: depois de `JwtAuthGuard` (precisa do usuário) e de `TenantScopeGuard`
 * (precisa do condomínio da request).
 *
 * ```
 * método é leitura?           → passa
 * rota isenta?                → passa
 * superadmin?                 → passa (a plataforma não se bloqueia)
 * bloqueio desligado?         → passa
 * quem paga por este usuário? → o responsável, que pode ser a administradora
 * status em cache ou na API   → 402 com motivo, valor e link
 * qualquer dúvida             → PASSA (fail-open)
 * ```
 *
 * ## O que este guard aceita conscientemente
 *
 * Com a escrita travada, **registrar encomenda também para** — é
 * `POST /encomendas`. Na prática a portaria para, e quem sente primeiro é o
 * morador, que não deve nada. A decisão foi tomada de olhos abertos, e os
 * amortecedores estão em três lugares: `dias_tolerancia` e
 * `max_faturas_vencidas` na política, e a constante `ISENTAS` aqui — basta uma
 * linha para manter `POST /encomendas` liberado se um dia isso doer demais.
 */
@Injectable()
export class AcessoAssinaturaGuard implements CanActivate {
  private readonly logger = new Logger(AcessoAssinaturaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request & { user?: { role?: string } }>();

    if (SO_LEITURA.has(req.method)) return true;

    const publico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publico) return true;

    const caminho = this.caminhoDaRota(req);
    if (ISENTAS.some((isenta) => caminho.startsWith(isenta))) return true;

    // A plataforma não se bloqueia.
    if (req.user?.role === 'superadmin') return true;

    // Resolvido tarde e por `ModuleRef` de propósito: o guard é global e mora em
    // `common/`, enquanto quem sabe quem paga por um condomínio é o módulo
    // Assinaturas. Injetar no construtor faria `common` depender de um módulo de
    // domínio — e é o tipo de dependência que, uma vez aberta, atrai as outras.
    //
    // `get()` **pode lançar** quando o provider não está registrado, e um guard
    // global que lança derruba toda escrita do sistema. Aqui o fail-open começa.
    const servico = this.servico();
    if (!servico?.ativo) return true;

    try {
      const situacao = await servico.situacaoDaRequest(req);
      if (situacao.liberado) return true;

      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'Payment Required',
          message: situacao.motivo ?? 'Assinatura em atraso',
          assinatura: {
            bloqueado: true,
            motivo: situacao.motivo,
            valorEmAberto: situacao.valorEmAberto,
            faturasVencidas: situacao.faturasVencidas,
            diasEmAtraso: situacao.diasEmAtraso,
            linkPagamento: situacao.linkPagamento,
            // Onde o cliente resolve. A tela usa isto para o botão da faixa.
            telaAssinatura: situacao.telaAssinatura,
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    } catch (err) {
      // O 402 que acabamos de lançar precisa subir; qualquer OUTRA falha vira
      // liberação. É aqui que o fail-open se fecha: um defeito neste guard não
      // pode tirar o sistema do ar para quem está em dia.
      if (err instanceof HttpException) throw err;
      this.logger.error(`Falha ao avaliar bloqueio (${(err as Error).message}) — liberando`);
      return true;
    }
  }

  /**
   * Quem sabe de assinatura — ou `null` se ninguém souber.
   *
   * Um guard **global** que lança na resolução do provider derrubaria toda
   * escrita do sistema com 500. Devolver `null` faz o bloqueio simplesmente não
   * acontecer, que é o desfecho seguro: pior que não bloquear um inadimplente é
   * bloquear todo mundo por causa de um módulo que não subiu.
   */
  private servico(): AcessoAssinaturaService | null {
    try {
      return this.moduleRef.get(AcessoAssinaturaService, { strict: false });
    } catch (err) {
      this.logger.error(
        `Serviço de bloqueio indisponível (${(err as Error).message}) — liberando tudo`,
      );
      return null;
    }
  }

  /** O caminho sem o prefixo global, para a lista de isentas ficar legível. */
  private caminhoDaRota(req: Request): string {
    const bruto = (req.route?.path as string | undefined) ?? req.path ?? '';
    return bruto.replace(/^\/api/, '');
  }
}
