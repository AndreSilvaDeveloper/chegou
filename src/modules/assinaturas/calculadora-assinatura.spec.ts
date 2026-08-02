import { ModoAssinatura } from '../../database/entities/assinatura-condicao.entity';
import {
  CondominioNaConta,
  FaixaPreco,
  TabelaDePrecosVaziaError,
  calcularAssinatura,
  faixaPara,
} from './calculadora-assinatura';

/**
 * A tabela do CONDOMÍNIO: 3,99 até 100 · 3,49 de 101 a 200 · 2,99 acima de 200.
 *
 * É a tabela de quem paga sozinho. A administradora tem a dela (`TABELA_ADM`),
 * e o que escolhe uma ou outra é o vínculo do cliente — nunca a tela.
 */
const TABELA: FaixaPreco[] = [
  { ateQuantidade: 100, precoApartamento: 3.99, ordem: 1 },
  { ateQuantidade: 200, precoApartamento: 3.49, ordem: 2 },
  { ateQuantidade: null, precoApartamento: 2.99, ordem: 3 },
];

/** A tabela da ADMINISTRADORA: preço de atacado, faixa única sem teto. */
const TABELA_ADM: FaixaPreco[] = [{ ateQuantidade: null, precoApartamento: 1.99, ordem: 1 }];

const condominio = (nome: string, apartamentos: number, id = nome): CondominioNaConta => ({
  tenantId: id,
  nome,
  apartamentos,
});

/**
 * Soma os itens em centavos.
 *
 * Somar reais com `+` acumula erro de ponto flutuante (37 parcelas de 20,93 dão
 * 774,4099999999995) — o mesmo motivo pelo qual a calculadora trabalha em
 * centavos. O teste precisa somar do jeito certo, senão acusa um bug que é dele.
 */
const somaDosItens = (itens: { subtotal: number }[]): number =>
  Math.round(itens.reduce((s, i) => s + Math.round(i.subtotal * 100), 0)) / 100;

describe('faixaPara — fronteiras da tabela', () => {
  it.each([
    [1, 3.99],
    [100, 3.99], // último da primeira faixa
    [101, 3.49], // primeiro da segunda
    [200, 3.49], // último da segunda
    [201, 2.99], // primeiro da terceira
    [5000, 2.99],
  ])('%i apartamentos → R$ %s por apartamento', (quantidade, preco) => {
    expect(faixaPara(TABELA, quantidade).precoApartamento).toBe(preco);
  });

  it.each([
    [1, 1.99],
    [500, 1.99],
    [10_000, 1.99],
  ])(
    'administradora com %i apartamentos → R$ %s por apartamento (faixa única)',
    (quantidade, preco) => {
      expect(faixaPara(TABELA_ADM, quantidade).precoApartamento).toBe(preco);
    },
  );

  it('condomínio sem apartamento cai na primeira faixa', () => {
    expect(faixaPara(TABELA, 0).precoApartamento).toBe(3.99);
  });

  it('tabela vazia é erro de configuração, não valor zero', () => {
    expect(() => faixaPara([], 10)).toThrow(TabelaDePrecosVaziaError);
  });

  it('sem faixa aberta no topo, quantidade acima de tudo cai na última', () => {
    const comTeto: FaixaPreco[] = [{ ateQuantidade: 10, precoApartamento: 5, ordem: 1 }];
    expect(faixaPara(comTeto, 999).precoApartamento).toBe(5);
  });
});

describe('calcularAssinatura — condomínio direto', () => {
  it('aplica a faixa ao total, não por trecho', () => {
    const r = calcularAssinatura({ condominios: [condominio('Aurora', 120)], faixas: TABELA });

    // 120 × 3,49 = 418,80 (e não 50×3,99 + 70×3,49 = 443,80)
    expect(r.quantidadeApartamentos).toBe(120);
    expect(r.precoAplicado).toBe(3.49);
    expect(r.valor).toBe(418.8);
    expect(r.faixa?.ordem).toBe(2);
  });

  it('condomínio pequeno paga a faixa cheia', () => {
    const r = calcularAssinatura({ condominios: [condominio('Vila', 32)], faixas: TABELA });
    expect(r.valor).toBe(127.68); // 32 × 3,99
  });

  it('sem apartamentos, não cobra', () => {
    const r = calcularAssinatura({ condominios: [condominio('Novo', 0)], faixas: TABELA });
    expect(r.valor).toBe(0);
    expect(r.itens[0].subtotal).toBe(0);
  });

  it('o item bate com o total', () => {
    const r = calcularAssinatura({ condominios: [condominio('Aurora', 137)], faixas: TABELA });
    expect(somaDosItens(r.itens)).toBe(r.valor);
  });
});

describe('calcularAssinatura — a tabela da administradora', () => {
  it('cobra o preço de atacado sobre a carteira somada', () => {
    const carteira = [condominio('A', 40), condominio('B', 70), condominio('C', 95)];
    const r = calcularAssinatura({ condominios: carteira, faixas: TABELA_ADM });

    // 205 × 1,99 = 407,95 — bem abaixo dos 613,95 que os três pagariam
    // separados na tabela de condomínio, que é o ponto do preço de carteira.
    expect(r.quantidadeApartamentos).toBe(205);
    expect(r.precoAplicado).toBe(1.99);
    expect(r.valor).toBe(407.95);
    expect(somaDosItens(r.itens)).toBe(r.valor);
  });

  it('faixa única não muda de preço por tamanho', () => {
    const pequena = calcularAssinatura({ condominios: [condominio('A', 10)], faixas: TABELA_ADM });
    const grande = calcularAssinatura({ condominios: [condominio('B', 3000)], faixas: TABELA_ADM });
    expect(pequena.precoAplicado).toBe(grande.precoAplicado);
  });
});

/**
 * A regra de somar a carteira para achar a faixa.
 *
 * Os casos usam a tabela do CONDOMÍNIO de propósito: é a que tem faixas, então é
 * nela que dá para provar que a soma é o que decide o preço. A regra vale para
 * qualquer tabela com mais de uma faixa — inclusive se a administradora um dia
 * passar a escalonar.
 */
describe('calcularAssinatura — a soma da carteira é que escolhe a faixa', () => {
  it('soma os condomínios para achar a faixa (desconto por volume)', () => {
    const carteira = [condominio('A', 40), condominio('B', 40), condominio('C', 40)];
    const r = calcularAssinatura({ condominios: carteira, faixas: TABELA });

    // Cada um sozinho pagaria 3,99; juntos são 120 → 3,49.
    expect(r.quantidadeApartamentos).toBe(120);
    expect(r.precoAplicado).toBe(3.49);
    expect(r.valor).toBe(418.8);
  });

  it('detalha um item por condomínio, e a soma fecha', () => {
    // 40 + 70 + 95 = 205 apartamentos: a carteira inteira atravessa para a
    // terceira faixa (2,99), inclusive o condomínio de 40 unidades.
    const carteira = [condominio('A', 40), condominio('B', 70), condominio('C', 95)];
    const r = calcularAssinatura({ condominios: carteira, faixas: TABELA });

    expect(r.precoAplicado).toBe(2.99);
    expect(r.itens).toHaveLength(3);
    expect(r.itens.map((i) => i.subtotal)).toEqual([119.6, 209.3, 284.05]);
    expect(somaDosItens(r.itens)).toBe(r.valorBruto);
  });

  it('carteira vazia não gera valor nem itens', () => {
    const r = calcularAssinatura({ condominios: [], faixas: TABELA });
    expect(r.valor).toBe(0);
    expect(r.itens).toEqual([]);
  });
});

describe('calcularAssinatura — preço especial', () => {
  it('preço por apartamento ignora as faixas', () => {
    const r = calcularAssinatura({
      condominios: [condominio('Aurora', 120)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.PRECO_APARTAMENTO, precoApartamento: 2.5 },
    });

    expect(r.precoAplicado).toBe(2.5);
    expect(r.valor).toBe(300);
    expect(r.faixa).toBeNull(); // não veio de faixa nenhuma
  });

  it('valor fixo ignora a contagem e rateia entre os condomínios', () => {
    const r = calcularAssinatura({
      condominios: [condominio('A', 40), condominio('B', 60)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.VALOR_FIXO, valorFixo: 900 },
    });

    expect(r.valor).toBe(900);
    expect(r.precoAplicado).toBeNull();
    expect(r.itens.map((i) => i.subtotal)).toEqual([360, 540]);
    expect(somaDosItens(r.itens)).toBe(900);
  });

  it('rateio com sobra de centavos ainda fecha com o total', () => {
    const r = calcularAssinatura({
      condominios: [condominio('A', 1), condominio('B', 1), condominio('C', 1)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.VALOR_FIXO, valorFixo: 100 },
    });

    // 100 / 3 não é exato: alguém leva o centavo que sobra.
    expect(somaDosItens(r.itens)).toBe(100);
  });

  it('desconto percentual entra depois, sobre qualquer modo', () => {
    const r = calcularAssinatura({
      condominios: [condominio('Aurora', 150)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.TABELA, descontoPercentual: 10 },
    });

    expect(r.valorBruto).toBe(523.5); // 150 × 3,49
    expect(r.desconto).toBe(52.35);
    expect(r.valor).toBe(471.15);
  });

  it('desconto de 100% zera sem ficar negativo', () => {
    const r = calcularAssinatura({
      condominios: [condominio('Cortesia', 80)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.TABELA, descontoPercentual: 100 },
    });
    expect(r.valor).toBe(0);
  });
});

describe('calcularAssinatura — dinheiro', () => {
  it('não acumula erro de ponto flutuante em carteira grande', () => {
    const carteira = Array.from({ length: 37 }, (_, i) => condominio(`C${i}`, 7));
    const r = calcularAssinatura({ condominios: carteira, faixas: TABELA });

    // 259 apartamentos → 2,99. 259 × 2,99 = 774,41
    expect(r.valor).toBe(774.41);
    expect(somaDosItens(r.itens)).toBe(774.41);
  });

  it('desconto arredonda ao centavo', () => {
    const r = calcularAssinatura({
      condominios: [condominio('X', 33)],
      faixas: TABELA,
      condicao: { modo: ModoAssinatura.TABELA, descontoPercentual: 7.5 },
    });

    // 33 × 3,99 = 131,67 · 7,5% = 9,875... → 9,88
    expect(r.valorBruto).toBe(131.67);
    expect(r.desconto).toBe(9.88);
    expect(r.valor).toBe(121.79);
    expect(Number((r.valorBruto - r.desconto).toFixed(2))).toBe(r.valor);
  });
});
