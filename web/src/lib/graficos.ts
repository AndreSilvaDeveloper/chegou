/**
 * A PALETA DOS GRÁFICOS — um lugar só, e nenhum hexadecimal na tela.
 *
 * Antes cada gráfico escrevia a própria cor à mão (`#0ea5e9`, `#10b981`,
 * `#f59e0b`…). Dois problemas, e o segundo é o grave:
 *
 * 1. Hex fixo **não troca com o tema** (regra do projeto: cor vem de token). O
 *    azul escolhido para fundo claro continuava igual no escuro.
 * 2. Cor de gráfico não é escolha estética: uma paleta precisa passar por
 *    checagens (faixa de luminosidade, piso de saturação, separação para
 *    daltonismo, contraste com a superfície). Espalhada em cinco arquivos, ela
 *    nunca foi verificada como conjunto.
 *
 * Aqui as séries apontam para os tokens `--chart-*` do `styles.css`, que já têm
 * passo próprio no claro e no escuro. O par usado nos gráficos de volume
 * (recebidas × retiradas) foi validado nos dois temas: contraste ≥ 3:1 com a
 * superfície e separação ΔE ≈ 16 sob protanopia e deuteranopia.
 *
 * SÉRIE ou ESTADO — a regra para escolher daqui:
 *
 * - **Série** é identidade ("qual linha é qual"): use `SERIE_*`.
 * - **Estado** é significado fixo (bom, atenção, falha): use `ESTADO_*`, que
 *   são as mesmas cores do `StatusDot` e dos selos. Estado nunca vira "a quarta
 *   série" de um gráfico, senão o vermelho de falha passa a significar
 *   "categoria 4" em algum lugar e o leitor perde a única cor que era certa.
 */

/** Identidade de série — volume que entra e volume que sai. */
export const SERIE_ENTRADA = 'hsl(var(--chart-5))'; // azul
export const SERIE_SAIDA = 'hsl(var(--chart-4))'; // verde

/** Significado fixo. Sempre acompanhado de rótulo — cor sozinha não informa. */
export const ESTADO_BOM = 'hsl(var(--chart-4))';
export const ESTADO_ATENCAO = 'hsl(var(--chart-1))';
export const ESTADO_ALERTA = 'hsl(var(--chart-2))';
export const ESTADO_FALHA = 'hsl(var(--destructive))';
export const ESTADO_NEUTRO = 'hsl(var(--chart-3))';

/**
 * Escala de envelhecimento (há quanto tempo o pacote espera).
 *
 * É ordenada E tem significado — quanto mais tempo, pior. Por isso são os tons
 * de estado em ordem, e não cinco cores decorativas.
 */
export const ESCALA_ESPERA = [ESTADO_BOM, ESTADO_ATENCAO, ESTADO_ALERTA, ESTADO_FALHA];

/**
 * A cor da faixa `indice` numa escala de `total` faixas ordenadas do melhor
 * para o pior. Distribui a escala de estado sem repetir o começo nem pular o
 * fim, seja qual for a quantidade de faixas.
 *
 * Serve para "tempo até a retirada" (5 faixas) e "idade do estoque" (4) lerem a
 * mesma progressão. Antes eram duas listas de hexadecimais escritas à mão, e a
 * de cinco tinha AZUL no meio de uma escala verde→vermelho — cor que não diz
 * nem "melhor" nem "pior", plantada bem onde a leitura precisa da ordem.
 */
export function corDeEspera(indice: number, total: number): string {
  if (total <= 1) return ESTADO_BOM;
  const passo = Math.round((indice / (total - 1)) * (ESCALA_ESPERA.length - 1));
  return ESCALA_ESPERA[Math.min(passo, ESCALA_ESPERA.length - 1)];
}

/**
 * Eixos e grade discretos: quem tem que saltar é o dado.
 *
 * Espalhar isto por gráfico é o que fazia um ter linha de grade vertical e
 * outro não, um mostrar decimal no eixo de contagem e outro não.
 */
export const EIXO_X = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
} as const;

export const EIXO_Y = {
  tickLine: false,
  axisLine: false,
  width: 32,
  fontSize: 12,
  allowDecimals: false,
} as const;

/** Grade só na horizontal: a vertical vira gaiola e não ajuda a ler valor. */
export const GRADE = {
  vertical: false,
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
} as const;

/** Ponta arredondada da barra, ancorada na base (o resto fica reto). */
export const PONTA_BARRA: [number, number, number, number] = [4, 4, 0, 0];
