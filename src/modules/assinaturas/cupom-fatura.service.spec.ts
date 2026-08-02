import type { Repository } from 'typeorm';
import { AssinaturaCupomCliente, AssinaturaFatura } from '../../database/entities';
import type { CuponsService } from '../pagamentos/cupons.service';
import { CupomFaturaService } from './cupom-fatura.service';

/**
 * O cupom resolvido para uma fatura.
 *
 * O que se prova aqui é que **toda dúvida devolve `null`** (= sem cupom, cobra
 * o valor cheio). Errar para mais é conserto de um clique; errar para menos é
 * dinheiro que não volta.
 */
class RepoFake {
  constructor(public atribuicao: AssinaturaCupomCliente | null) {}
  async findOne() {
    return this.atribuicao;
  }
}

const FATURA = {
  id: 'fatura-1',
  competencia: '2026-04-01',
  valor: 418.8,
} as AssinaturaFatura;

const CLIENTE = { tipo: 'condominio' as const, id: 'tenant-1' };

const atribuicao = (over: Partial<AssinaturaCupomCliente> = {}): AssinaturaCupomCliente =>
  ({ codigo: 'DESC20', ativo: true, aplicarAte: null, ...over }) as AssinaturaCupomCliente;

describe('CupomFaturaService', () => {
  let cupons: { validar: jest.Mock };

  const montar = (a: AssinaturaCupomCliente | null) =>
    new CupomFaturaService(
      new RepoFake(a) as unknown as Repository<AssinaturaCupomCliente>,
      cupons as unknown as CuponsService,
    );

  beforeEach(() => {
    cupons = { validar: jest.fn() };
  });

  describe('resolver', () => {
    it('devolve o desconto e os DOIS valores', async () => {
      cupons.validar.mockResolvedValue({
        valid: true,
        discountAmount: 83.76,
        originalValue: 418.8,
        finalValue: 335.04,
      });

      const r = await montar(atribuicao()).resolver(FATURA, CLIENTE, '42');

      // `valorSemCupom` é o que vai para o gateway; `valorLiquido` é o que a
      // fatura passa a dizer. Confundir os dois aplica o desconto duas vezes.
      expect(r).toEqual({
        codigo: 'DESC20',
        desconto: 83.76,
        valorSemCupom: 418.8,
        valorLiquido: 335.04,
      });
    });

    it('usa o `finalValue` DELES, não uma subtração nossa', async () => {
      // Se as duas contas divergirem por arredondamento, quem manda é quem vai
      // descontar de verdade.
      cupons.validar.mockResolvedValue({
        valid: true,
        discountAmount: 83.76,
        finalValue: 335.03,
      });

      const r = await montar(atribuicao()).resolver(FATURA, CLIENTE, '42');

      expect(r!.valorLiquido).toBe(335.03);
    });

    it('valida com o valor CHEIO da fatura', async () => {
      cupons.validar.mockResolvedValue({ valid: true, discountAmount: 10, finalValue: 408.8 });

      await montar(atribuicao()).resolver(FATURA, CLIENTE, '42');

      expect(cupons.validar).toHaveBeenCalledWith('DESC20', '42', 418.8);
    });
  });

  describe('toda dúvida cobra o valor cheio', () => {
    it('sem cupom atribuído', async () => {
      await expect(montar(null).resolver(FATURA, CLIENTE, '42')).resolves.toBeNull();
      expect(cupons.validar).not.toHaveBeenCalled();
    });

    it('gateway que não respondeu à validação', async () => {
      cupons.validar.mockResolvedValue(null);

      await expect(montar(atribuicao()).resolver(FATURA, CLIENTE, '42')).resolves.toBeNull();
    });

    it('cupom recusado pelo gateway (limite estourado, fora da vigência)', async () => {
      cupons.validar.mockResolvedValue({
        valid: false,
        message: 'Cliente ja utilizou o cupom o numero maximo de vezes',
      });

      await expect(montar(atribuicao()).resolver(FATURA, CLIENTE, '42')).resolves.toBeNull();
    });

    it('desconto zero não vira cupom aplicado', async () => {
      cupons.validar.mockResolvedValue({ valid: true, discountAmount: 0, finalValue: 418.8 });

      await expect(montar(atribuicao()).resolver(FATURA, CLIENTE, '42')).resolves.toBeNull();
    });
  });

  describe('`aplicar_ate` — o freio do nosso lado', () => {
    it('competência depois do limite não aplica', async () => {
      // O limite de USO é do gateway; "este cliente para de receber em março" é
      // decisão comercial nossa.
      const service = montar(atribuicao({ aplicarAte: '2026-03-01' }));

      await expect(service.resolver(FATURA, CLIENTE, '42')).resolves.toBeNull();
      expect(cupons.validar).not.toHaveBeenCalled();
    });

    it('competência igual ao limite ainda aplica — é o último mês, inclusive', async () => {
      cupons.validar.mockResolvedValue({ valid: true, discountAmount: 10, finalValue: 408.8 });
      const service = montar(atribuicao({ aplicarAte: '2026-04-01' }));

      await expect(service.resolver(FATURA, CLIENTE, '42')).resolves.not.toBeNull();
    });

    it('sem limite, aplica enquanto valer no gateway', async () => {
      cupons.validar.mockResolvedValue({ valid: true, discountAmount: 10, finalValue: 408.8 });

      await expect(
        montar(atribuicao({ aplicarAte: null })).resolver(FATURA, CLIENTE, '42'),
      ).resolves.not.toBeNull();
    });
  });
});
