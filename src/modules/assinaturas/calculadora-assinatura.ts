import { ModoAssinatura } from '../../database/entities/assinatura-condicao.entity';

/** Uma faixa da tabela de preços (`ateQuantidade` null = última, sem teto). */
export interface FaixaPreco {
  ateQuantidade: number | null;
  precoApartamento: number;
  ordem: number;
}

/** Um condomínio entrando na conta. */
export interface CondominioNaConta {
  tenantId: string;
  nome: string;
  apartamentos: number;
}

/** O preço negociado com o cliente, quando existe. */
export interface CondicaoEspecial {
  modo: ModoAssinatura;
  precoApartamento?: number | null;
  valorFixo?: number | null;
  descontoPercentual?: number | null;
}

export interface ItemCalculado {
  tenantId: string;
  nome: string;
  apartamentos: number;
  subtotal: number;
}

export interface ResultadoAssinatura {
  quantidadeApartamentos: number;
  modo: ModoAssinatura;
  /** Preço por apartamento cobrado. `null` quando o modo é valor fixo. */
  precoAplicado: number | null;
  /** Faixa usada — só quando o preço veio da tabela. Serve para explicar na tela. */
  faixa: FaixaPreco | null;
  valorBruto: number;
  desconto: number;
  valor: number;
  itens: ItemCalculado[];
}

export class TabelaDePrecosVaziaError extends Error {
  constructor() {
    super('Não há faixas de preço cadastradas para calcular a assinatura');
    this.name = 'TabelaDePrecosVaziaError';
  }
}

// Dinheiro anda em centavos (inteiro) do começo ao fim. Multiplicar float por
// quantidade e arredondar no meio é como uma fatura de 200 apartamentos fecha
// com um centavo a menos que a soma dos itens.
const emCentavos = (reais: number): number => Math.round(reais * 100);
const emReais = (centavos: number): number => centavos / 100;

/**
 * Encontra a faixa de uma quantidade.
 *
 * A faixa é a primeira (em ordem) cujo teto alcança a quantidade. O preço dela
 * vale para **todos** os apartamentos — não é escalonado por trecho.
 */
export function faixaPara(faixas: FaixaPreco[], quantidade: number): FaixaPreco {
  if (faixas.length === 0) throw new TabelaDePrecosVaziaError();

  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem);
  const encontrada = ordenadas.find(
    (f) => f.ateQuantidade === null || quantidade <= f.ateQuantidade,
  );
  // Tabela sem faixa aberta no topo (todas com teto) e quantidade acima de
  // todas: cai na última, que é o comportamento menos surpreendente.
  return encontrada ?? ordenadas[ordenadas.length - 1];
}

/**
 * Calcula o que um cliente paga no mês.
 *
 * O cliente pode ser um condomínio direto (um item) ou uma administradora
 * (um item por condomínio da carteira). A quantidade que define a faixa é
 * **a soma de todos os itens** — é o desconto por volume da carteira.
 */
export function calcularAssinatura(params: {
  condominios: CondominioNaConta[];
  faixas: FaixaPreco[];
  condicao?: CondicaoEspecial | null;
}): ResultadoAssinatura {
  const { condominios, faixas, condicao } = params;
  const quantidade = condominios.reduce((soma, c) => soma + c.apartamentos, 0);
  const modo = condicao?.modo ?? ModoAssinatura.TABELA;

  let precoCentavos: number | null = null;
  let faixaUsada: FaixaPreco | null = null;
  let brutoCentavos: number;

  if (modo === ModoAssinatura.VALOR_FIXO) {
    brutoCentavos = emCentavos(condicao?.valorFixo ?? 0);
  } else {
    if (modo === ModoAssinatura.PRECO_APARTAMENTO) {
      precoCentavos = emCentavos(condicao?.precoApartamento ?? 0);
    } else {
      faixaUsada = faixaPara(faixas, quantidade);
      precoCentavos = emCentavos(faixaUsada.precoApartamento);
    }
    brutoCentavos = quantidade * precoCentavos;
  }

  const pct = condicao?.descontoPercentual ?? 0;
  const descontoCentavos = pct > 0 ? Math.round((brutoCentavos * pct) / 100) : 0;
  const liquidoCentavos = Math.max(0, brutoCentavos - descontoCentavos);

  return {
    quantidadeApartamentos: quantidade,
    modo,
    precoAplicado: precoCentavos === null ? null : emReais(precoCentavos),
    faixa: faixaUsada,
    valorBruto: emReais(brutoCentavos),
    desconto: emReais(descontoCentavos),
    valor: emReais(liquidoCentavos),
    itens: montarItens(condominios, precoCentavos, brutoCentavos),
  };
}

/**
 * Distribui o valor entre os condomínios.
 *
 * Com preço por apartamento é multiplicação direta. Com valor fixo é rateio
 * proporcional — e a sobra dos centavos vai para o maior condomínio, senão a
 * soma dos itens não bate com o total da fatura.
 */
function montarItens(
  condominios: CondominioNaConta[],
  precoCentavos: number | null,
  brutoCentavos: number,
): ItemCalculado[] {
  if (condominios.length === 0) return [];

  if (precoCentavos !== null) {
    return condominios.map((c) => ({
      tenantId: c.tenantId,
      nome: c.nome,
      apartamentos: c.apartamentos,
      subtotal: emReais(c.apartamentos * precoCentavos),
    }));
  }

  const totalApartamentos = condominios.reduce((s, c) => s + c.apartamentos, 0);
  const partes = condominios.map((c) => ({
    ...c,
    centavos:
      totalApartamentos > 0
        ? Math.floor((brutoCentavos * c.apartamentos) / totalApartamentos)
        : Math.floor(brutoCentavos / condominios.length),
  }));

  const sobra = brutoCentavos - partes.reduce((s, p) => s + p.centavos, 0);
  if (sobra > 0) {
    // Desempate estável pelo id: o mesmo lote calculado duas vezes dá igual.
    const maior = [...partes].sort(
      (a, b) => b.apartamentos - a.apartamentos || a.tenantId.localeCompare(b.tenantId),
    )[0];
    maior.centavos += sobra;
  }

  return partes.map((p) => ({
    tenantId: p.tenantId,
    nome: p.nome,
    apartamentos: p.apartamentos,
    subtotal: emReais(p.centavos),
  }));
}
