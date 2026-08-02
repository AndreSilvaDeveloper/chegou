import { ExecutionContext, HttpException } from '@nestjs/common';
import type { ModuleRef, Reflector } from '@nestjs/core';
import { AcessoAssinaturaGuard } from './acesso-assinatura.guard';
import type { SituacaoDeBloqueio } from './acesso-assinatura.service';

/**
 * O guard que pode tirar clientes do ar.
 *
 * Metade dos casos aqui é sobre **o que NÃO bloqueia**: leitura, rotas de
 * pagamento, superadmin, e todo caminho de falha. A outra metade prova que o
 * 402 sai com o que o cliente precisa para resolver.
 */
const BLOQUEADO: SituacaoDeBloqueio = {
  liberado: false,
  motivo: 'Assinatura em atraso',
  valorEmAberto: 418.8,
  faturasVencidas: 1,
  diasEmAtraso: 12,
  linkPagamento: 'https://asaas.com/i/5030',
  telaAssinatura: '/assinatura',
};

const contexto = (
  metodo: string,
  caminho: string,
  user: Record<string, unknown> | undefined = { role: 'sindico' },
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method: metodo, path: caminho, route: { path: caminho }, user }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

describe('AcessoAssinaturaGuard', () => {
  let servico: { ativo: boolean; situacaoDaRequest: jest.Mock };
  let guard: AcessoAssinaturaGuard;
  let publico: boolean;

  beforeEach(() => {
    publico = false;
    servico = { ativo: true, situacaoDaRequest: jest.fn().mockResolvedValue(BLOQUEADO) };

    const reflector = { getAllAndOverride: () => publico } as unknown as Reflector;
    const moduleRef = { get: () => servico } as unknown as ModuleRef;
    guard = new AcessoAssinaturaGuard(reflector, moduleRef);
  });

  describe('o que NUNCA bloqueia', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('%s passa — leitura nunca é bloqueada', async (metodo) => {
      await expect(guard.canActivate(contexto(metodo, '/encomendas'))).resolves.toBe(true);
      expect(servico.situacaoDaRequest).not.toHaveBeenCalled();
    });

    it.each([
      ['/auth/login', 'login precisa funcionar: é onde ele descobre o bloqueio'],
      ['/assinatura', 'é onde está o link para pagar'],
      ['/assinatura/faturas/x/pagamento', 'idem'],
      ['/minha-administradora/assinatura', 'a conta da carteira'],
      ['/health', 'monitoração'],
      ['/webhooks/pagamentos', 'outro sistema, sem usuário logado'],
    ])('POST %s passa — %s', async (caminho) => {
      await expect(guard.canActivate(contexto('POST', caminho))).resolves.toBe(true);
    });

    it('superadmin passa — a plataforma não se bloqueia', async () => {
      await expect(
        guard.canActivate(contexto('POST', '/encomendas', { role: 'superadmin' })),
      ).resolves.toBe(true);
    });

    it('rota pública passa', async () => {
      publico = true;
      await expect(guard.canActivate(contexto('POST', '/cadastro/token'))).resolves.toBe(true);
    });

    it('bloqueio desligado passa sem consultar nada', async () => {
      servico.ativo = false;
      await expect(guard.canActivate(contexto('POST', '/encomendas'))).resolves.toBe(true);
      expect(servico.situacaoDaRequest).not.toHaveBeenCalled();
    });

    it('**serviço indisponível passa** — o guard não pode ser ponto único de falha', async () => {
      const moduleRef = {
        get: () => {
          throw new Error('provider não encontrado');
        },
      } as unknown as ModuleRef;
      const g = new AcessoAssinaturaGuard(
        { getAllAndOverride: () => false } as unknown as Reflector,
        moduleRef,
      );

      await expect(g.canActivate(contexto('POST', '/encomendas'))).resolves.toBe(true);
    });

    it('**falha ao avaliar passa** (fail-open)', async () => {
      servico.situacaoDaRequest.mockRejectedValue(new Error('banco fora'));

      await expect(guard.canActivate(contexto('POST', '/encomendas'))).resolves.toBe(true);
    });

    it('cliente em dia passa', async () => {
      servico.situacaoDaRequest.mockResolvedValue({ liberado: true });

      await expect(guard.canActivate(contexto('POST', '/encomendas'))).resolves.toBe(true);
    });
  });

  describe('402 na escrita', () => {
    it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('%s bloqueado responde 402', async (metodo) => {
      await expect(guard.canActivate(contexto(metodo, '/encomendas'))).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('a resposta carrega o que o cliente precisa para resolver', async () => {
      const erro = await guard
        .canActivate(contexto('POST', '/encomendas'))
        .catch((e: HttpException) => e);

      expect((erro as HttpException).getStatus()).toBe(402);
      expect((erro as HttpException).getResponse()).toMatchObject({
        message: 'Assinatura em atraso',
        assinatura: {
          bloqueado: true,
          valorEmAberto: 418.8,
          linkPagamento: 'https://asaas.com/i/5030',
          telaAssinatura: '/assinatura',
        },
      });
    });

    it('o 402 sobe — não é engolido pelo fail-open', async () => {
      // O `catch` do guard precisa deixar passar a própria HttpException, senão
      // o bloqueio nunca aconteceria de verdade.
      await expect(guard.canActivate(contexto('POST', '/encomendas'))).rejects.toMatchObject({
        status: 402,
      });
    });
  });

  describe('a decisão consciente', () => {
    it('POST /encomendas É bloqueado — a portaria para junto', async () => {
      // Documentado no plano (§ 9.2) e aceito de olhos abertos. Os amortecedores
      // são a tolerância em dias, o número de faturas e ESTA lista de isentas:
      // basta uma linha para liberar a portaria se um dia doer demais.
      await expect(guard.canActivate(contexto('POST', '/encomendas'))).rejects.toMatchObject({
        status: 402,
      });
    });
  });
});
