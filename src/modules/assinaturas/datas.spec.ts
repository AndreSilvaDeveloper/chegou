import { diaAnterior, diasEntre, primeiroDia, vencimentoDaCompetencia } from './datas';

describe('Datas da assinatura', () => {
  describe('vencimentoDaCompetencia', () => {
    it('vence no mês seguinte à competência (a assinatura é pós-paga)', () => {
      expect(vencimentoDaCompetencia('2026-03', 10)).toBe('2026-04-10');
    });

    it('vira o ano em dezembro', () => {
      expect(vencimentoDaCompetencia('2026-12', 10)).toBe('2027-01-10');
    });

    it('dia 31 em mês de 30 cai no último dia, nunca no mês seguinte', () => {
      // Competência de março vence em abril, que tem 30 dias.
      expect(vencimentoDaCompetencia('2026-03', 31)).toBe('2026-04-30');
    });

    it('fevereiro respeita o ano bissexto', () => {
      expect(vencimentoDaCompetencia('2027-01', 31)).toBe('2027-02-28');
      expect(vencimentoDaCompetencia('2028-01', 31)).toBe('2028-02-29');
    });
  });

  describe('diaAnterior', () => {
    it('anda um dia para trás', () => {
      expect(diaAnterior('2026-07-15')).toBe('2026-07-14');
    });

    it('atravessa o começo do mês', () => {
      expect(diaAnterior('2026-07-01')).toBe('2026-06-30');
    });

    it('atravessa o começo do ano', () => {
      expect(diaAnterior('2026-01-01')).toBe('2025-12-31');
    });

    it('acha o 29 de fevereiro do ano bissexto', () => {
      expect(diaAnterior('2028-03-01')).toBe('2028-02-29');
    });
  });

  describe('diasEntre', () => {
    it('conta para a frente e para trás', () => {
      expect(diasEntre('2026-07-10', '2026-07-13')).toBe(3);
      expect(diasEntre('2026-07-13', '2026-07-10')).toBe(-3);
      expect(diasEntre('2026-07-10', '2026-07-10')).toBe(0);
    });

    it('atravessa mês e ano', () => {
      expect(diasEntre('2026-07-30', '2026-08-02')).toBe(3);
      expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3);
    });

    // Em São Paulo o horário de verão já acabou, mas a conta é feita em UTC
    // justamente para não voltar a depender disso.
    it('não escorrega na virada do horário de verão', () => {
      expect(diasEntre('2017-10-14', '2017-10-15')).toBe(1);
      expect(diasEntre('2018-02-17', '2018-02-18')).toBe(1);
    });

    it('conta o 29 de fevereiro do ano bissexto', () => {
      expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2);
      expect(diasEntre('2027-02-28', '2027-03-01')).toBe(1);
    });
  });

  it('competência guarda o dia 1', () => {
    expect(primeiroDia('2026-07')).toBe('2026-07-01');
  });
});
