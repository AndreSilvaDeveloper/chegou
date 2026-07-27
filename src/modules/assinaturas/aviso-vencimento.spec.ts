import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import { avaliarVencimento, type FaturaAvaliavel } from './aviso-vencimento';

/**
 * A régua do aviso: 3 dias antes, no dia, e enquanto estiver vencida.
 *
 * `HOJE` é fixo porque a regra é sobre distância entre datas — amarrar o teste
 * ao relógio faria a suíte mudar de resultado sozinha na virada do dia.
 */
const HOJE = '2026-08-10';

function fatura(over: Partial<FaturaAvaliavel> = {}): FaturaAvaliavel {
  return {
    id: 'f1',
    competencia: '2026-07-01',
    vencimento: '2026-08-10',
    valor: 418.8,
    status: StatusFatura.ABERTA,
    ...over,
  };
}

describe('Aviso de vencimento da assinatura', () => {
  describe('quando avisar', () => {
    it('não avisa com o vencimento longe', () => {
      expect(avaliarVencimento([fatura({ vencimento: '2026-08-14' })], HOJE)).toBeNull();
    });

    it('começa a avisar exatamente 3 dias antes', () => {
      const aviso = avaliarVencimento([fatura({ vencimento: '2026-08-13' })], HOJE);
      expect(aviso?.situacao).toBe('vence_em_breve');
      expect(aviso?.diasParaVencer).toBe(3);
    });

    it('no dia do vencimento muda de tom', () => {
      const aviso = avaliarVencimento([fatura({ vencimento: HOJE })], HOJE);
      expect(aviso?.situacao).toBe('vence_hoje');
      expect(aviso?.diasParaVencer).toBe(0);
    });

    it('depois de vencer, o atraso vem negativo', () => {
      const aviso = avaliarVencimento([fatura({ vencimento: '2026-08-08' })], HOJE);
      expect(aviso?.situacao).toBe('vencida');
      expect(aviso?.diasParaVencer).toBe(-2);
    });

    it('continua avisando meses depois — vencida não some da tela', () => {
      const aviso = avaliarVencimento([fatura({ vencimento: '2026-02-10' })], HOJE);
      expect(aviso?.situacao).toBe('vencida');
      expect(aviso?.diasParaVencer).toBe(-181);
    });
  });

  describe('o que não gera aviso', () => {
    it('cliente sem fatura nenhuma', () => {
      expect(avaliarVencimento([], HOJE)).toBeNull();
    });

    it('fatura paga', () => {
      expect(
        avaliarVencimento([fatura({ status: StatusFatura.PAGA, vencimento: '2026-08-01' })], HOJE),
      ).toBeNull();
    });

    // Cancelada não foi cobrada e não é dívida — mesma regra do `resumo()`.
    it('fatura cancelada', () => {
      expect(
        avaliarVencimento(
          [fatura({ status: StatusFatura.CANCELADA, vencimento: '2026-07-01' })],
          HOJE,
        ),
      ).toBeNull();
    });
  });

  describe('qual fatura entra em destaque', () => {
    it('a mais antiga em aberto, porque é a que corre há mais tempo', () => {
      const aviso = avaliarVencimento(
        [
          fatura({ id: 'nova', vencimento: '2026-08-10' }),
          fatura({ id: 'velha', vencimento: '2026-06-10', status: StatusFatura.VENCIDA }),
          fatura({ id: 'paga', vencimento: '2026-05-10', status: StatusFatura.PAGA }),
        ],
        HOJE,
      );

      expect(aviso?.faturaId).toBe('velha');
      expect(aviso?.situacao).toBe('vencida');
    });

    // Se o destaque fosse pela mais recente, uma fatura de setembro (longe)
    // escondia a de agosto que vence hoje.
    it('a de vencimento próximo não é ofuscada por uma distante', () => {
      const aviso = avaliarVencimento(
        [
          fatura({ id: 'setembro', vencimento: '2026-09-10' }),
          fatura({ id: 'agosto', vencimento: '2026-08-10' }),
        ],
        HOJE,
      );

      expect(aviso?.faturaId).toBe('agosto');
      expect(aviso?.situacao).toBe('vence_hoje');
    });

    /**
     * `atualizarVencidas()` só roda quando alguém consulta. Entre o vencimento
     * e a próxima consulta, o banco ainda diz `aberta` numa fatura que já
     * venceu — quem decide é a data.
     */
    it('a data manda no status: `aberta` com vencimento passado é vencida', () => {
      const aviso = avaliarVencimento(
        [fatura({ status: StatusFatura.ABERTA, vencimento: '2026-08-09' })],
        HOJE,
      );

      expect(aviso?.situacao).toBe('vencida');
    });
  });

  describe('o total em aberto', () => {
    it('soma todas as pendentes, não só a que está em destaque', () => {
      const aviso = avaliarVencimento(
        [
          fatura({ id: 'a', vencimento: '2026-08-10', valor: 418.8 }),
          fatura({ id: 'b', vencimento: '2026-07-10', valor: 191.95, status: StatusFatura.VENCIDA }),
          fatura({ id: 'c', vencimento: '2026-06-10', valor: 500, status: StatusFatura.PAGA }),
        ],
        HOJE,
      );

      expect(aviso?.quantidadeEmAberto).toBe(2);
      expect(aviso?.totalEmAberto).toBe(610.75);
      // O destaque continua sendo uma fatura só.
      expect(aviso?.valor).toBe(191.95);
    });

    it('não acumula centavo fantasma somando float', () => {
      const aviso = avaliarVencimento(
        [
          fatura({ id: 'a', vencimento: '2026-08-10', valor: 0.1 }),
          fatura({ id: 'b', vencimento: '2026-08-09', valor: 0.2 }),
        ],
        HOJE,
      );

      expect(aviso?.totalEmAberto).toBe(0.3);
    });
  });
});
