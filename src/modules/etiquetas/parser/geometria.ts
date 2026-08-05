/**
 * Geometria das linhas do OCR.
 *
 * O serviço de OCR já devolve a caixa de cada linha e já as ordena por XY-cut
 * (`ocr/app.py`), e o Postgres guarda isso em `ocr_linhas`. Até a v2 o parser
 * jogava tudo fora na primeira instrução — `linhas.map(l => l.texto).join()` — e
 * decidia destinatário e unidade sobre um blob de texto sem posição.
 *
 * Era a causa de fundo dos dois piores defeitos do módulo:
 *
 * 1. O endereço de destino, o do remetente e o de devolução viram um texto só,
 *    e a primeira ocorrência de qualquer regex vence. Uma etiqueta da Shopee tem
 *    três CEPs e dois nomes de pessoa; sem posição, não há como saber qual é qual.
 * 2. A quebra de linha do OCR passou a valer como fronteira semântica (`ESPACO`,
 *    que não atravessa `\n`) porque era a única defesa disponível. Só que a
 *    quebra dentro de um endereço é acidente de largura da etiqueta:
 *    `... 2288, Sala` / `1205 ed solar do progresso` é uma frase só, e a defesa
 *    contra o blob global jogava fora o número da sala.
 *
 * Aqui as linhas voltam a ter posição e se agrupam em **blocos** — o que a
 * etiqueta imprimiu junto. Quem decide o que cada bloco significa é `zonas.ts`.
 */
import type { LinhaOcr } from '../../../database/entities';
import { normalizar } from './texto';

export interface Caixa {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Uma linha do OCR já normalizada e posicionada. */
export interface Linha {
  /** Maiúscula, sem acento, espaços colapsados — a forma que as regex esperam. */
  texto: string;
  confianca: number;
  caixa: Caixa;
  /** Posição na ordem de leitura devolvida pelo OCR. */
  ordem: number;
}

/** Linhas que a etiqueta imprimiu juntas — um parágrafo, um carimbo, uma caixa. */
export interface Bloco {
  linhas: Linha[];
  /**
   * Linhas unidas por `' \n '`. É o texto **seguro**: as regex do parser usam
   * `ESPACO` (`[^\S\n]*`), que não atravessa a quebra, então uma palavra-chave
   * no fim de uma linha não captura o número da linha seguinte.
   */
  texto: string;
  /**
   * As mesmas linhas unidas por espaço simples, desfazendo a quebra.
   *
   * **Só use em bloco de zona `destino`.** Ali a quebra é artefato da largura da
   * etiqueta e desfazê-la é o que recupera `Sala` + `1205`. Fora dali ela é
   * fronteira de verdade, e desfazê-la traz de volta o bug de `CASA` colar no
   * telefone da linha de baixo.
   */
  textoCorrido: string;
  caixa: Caixa;
  /** Média das linhas, ponderada por área quando há geometria de verdade. */
  confianca: number;
}

export const SEPARADOR = ' \n ';

function caixaDe(box: LinhaOcr['box']): Caixa {
  const [x1, y1, x2, y2] = box ?? [0, 0, 0, 0];
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  };
}

function area(c: Caixa): number {
  return Math.max(0, c.x2 - c.x1) * Math.max(0, c.y2 - c.y1);
}

function unir(a: Caixa, b: Caixa): Caixa {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

/** Os intervalos horizontais se cruzam? Coluna ao lado nunca cruza a de cá. */
function cruzaEmX(a: Caixa, b: Caixa): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2;
}

export interface Preparo {
  linhas: Linha[];
  /**
   * `false` quando as caixas vieram zeradas — é o caso de `extrairDeTexto`, do
   * teste e de amostra antiga gravada antes de o OCR mandar `box`. Sem
   * geometria não dá para cortar por vão, e o agrupamento passa a depender só
   * dos marcadores de zona.
   */
  comGeometria: boolean;
}

/** Linhas do OCR → linhas normalizadas e posicionadas, na ordem de leitura. */
export function prepararLinhas(linhas: LinhaOcr[]): Preparo {
  const preparadas: Linha[] = [];

  for (const linha of linhas ?? []) {
    const texto = normalizar(linha?.texto ?? '');
    if (!texto) continue;
    preparadas.push({
      texto,
      confianca: Number.isFinite(linha?.confianca) ? linha.confianca : 1,
      caixa: caixaDe(linha?.box),
      ordem: preparadas.length,
    });
  }

  const comGeometria = preparadas.some((l) => area(l.caixa) > 0);
  if (!comGeometria) {
    // Caixas sintéticas empilhadas: preservam a ordem de leitura e o
    // `cruzaEmX`, e o corte por vão fica desligado (ver `agruparBlocos`).
    for (const linha of preparadas) {
      linha.caixa = { x1: 0, y1: linha.ordem, x2: 1000, y2: linha.ordem + 1 };
    }
  }

  return { linhas: preparadas, comGeometria };
}

/** Altura mediana da linha — a régua de "vão grande" na etiqueta. */
function alturaMediana(linhas: Linha[]): number {
  const alturas = linhas.map((l) => l.caixa.y2 - l.caixa.y1).sort((a, b) => a - b);
  return Math.max(1, alturas[Math.floor(alturas.length / 2)] ?? 1);
}

export interface OpcoesAgrupamento {
  comGeometria: boolean;
  /**
   * Linha que **começa** um bloco novo mesmo colada na anterior. É como o
   * rótulo entra: `DESTINATÁRIO` impresso dentro de uma tarja preta encosta no
   * nome logo abaixo, e sem isso o rótulo e o conteúdo virariam um bloco só com
   * o bloco anterior (o do remetente) junto.
   */
  iniciaBloco?: (texto: string) => boolean;
}

/**
 * Agrupa as linhas em blocos.
 *
 * Corta em três situações: vão vertical maior que ~0,9 linha, coluna diferente
 * (nenhuma sobreposição horizontal) e linha marcada por `iniciaBloco`.
 *
 * O limite de 0,9 é o mesmo espírito do `_xy_cut` do serviço de OCR: separa
 * parágrafos sem separar as linhas de um mesmo endereço, que ficam bem mais
 * juntas do que a altura de uma linha.
 */
export function agruparBlocos(linhas: Linha[], opcoes: OpcoesAgrupamento): Bloco[] {
  if (linhas.length === 0) return [];

  const folga = alturaMediana(linhas) * 0.9;
  const grupos: Linha[][] = [];
  let caixaAtual: Caixa | null = null;

  for (const linha of linhas) {
    const marcador = opcoes.iniciaBloco?.(linha.texto) ?? false;
    let corta = marcador || caixaAtual === null;

    if (!corta && caixaAtual && opcoes.comGeometria) {
      // O fim considerado é o MAIOR já visto no bloco, não o da linha anterior:
      // uma linha alta e estreita (um número gigante de triagem) abriria um vão
      // falso logo depois de si.
      const vao = linha.caixa.y1 - caixaAtual.y2;
      corta = vao > folga || !cruzaEmX(caixaAtual, linha.caixa);
    }

    if (corta) {
      grupos.push([]);
      caixaAtual = linha.caixa;
    } else if (caixaAtual) {
      caixaAtual = unir(caixaAtual, linha.caixa);
    }

    grupos[grupos.length - 1].push(linha);
  }

  return grupos.map(montarBloco);
}

function montarBloco(linhas: Linha[]): Bloco {
  const textos = linhas.map((l) => l.texto);
  let caixa = linhas[0].caixa;
  for (const linha of linhas.slice(1)) caixa = unir(caixa, linha.caixa);

  return {
    linhas,
    texto: textos.join(SEPARADOR),
    textoCorrido: textos.join(' '),
    caixa,
    confianca: confiancaMedia(linhas),
  };
}

/**
 * Média ponderada por área, como no modelo de confiança do Poupe no Mercado:
 * uma palavra minúscula lida com 0,4 não pode derrubar a confiança de um bloco
 * cujo conteúdo relevante veio grande e nítido.
 */
export function confiancaMedia(linhas: Linha[]): number {
  if (linhas.length === 0) return 0;

  let soma = 0;
  let pesoTotal = 0;
  for (const linha of linhas) {
    const peso = Math.max(area(linha.caixa), 1e-6);
    soma += linha.confianca * peso;
    pesoTotal += peso;
  }
  return pesoTotal > 0 ? soma / pesoTotal : 0;
}
