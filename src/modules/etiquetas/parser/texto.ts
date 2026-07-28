/**
 * Normalização de texto vindo do OCR.
 *
 * Tudo aqui existe porque o OCR erra de formas previsíveis, e é mais barato
 * normalizar a entrada do que espalhar variações por dezenas de regex.
 */

/**
 * Remove acento sem perder a letra: `SÃO` -> `SAO`.
 *
 * O `NFD` separa a letra do acento; `\p{M}` (marca combinante) apaga o acento
 * e deixa a letra. Usa propriedade Unicode em vez da faixa `U+0300-U+036F`
 * porque aquela versão exige caracteres invisíveis no meio do código-fonte —
 * some no primeiro copiar-e-colar mal resolvido e ninguém enxerga o estrago.
 */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Forma canônica usada por TODAS as regex do parser: maiúscula, sem acento,
 * espaços colapsados. Depois disto só existe `[A-Z0-9]` e pontuação.
 */
export function normalizar(texto: string): string {
  return semAcento(texto).toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Corrige as confusões clássicas do OCR **em trecho que já se sabe numérico**.
 *
 * Nunca aplique no texto inteiro: em etiqueta térmica isso transformaria
 * `BLOCO` em `8L0C0`. Só use depois de decidir que o pedaço é um número.
 */
export function digitosProvaveis(trecho: string): string {
  return trecho
    .replace(/[OQD]/g, '0')
    .replace(/[IL|]/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8')
    .replace(/Z/g, '2');
}

/**
 * O inverso: trecho que se sabe alfabético e o OCR devolveu com dígito.
 * Usado no código dos Correios, cujas 2 primeiras e 2 últimas posições são
 * garantidamente letras.
 */
export function letrasProvaveis(trecho: string): string {
  return trecho
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B');
}

/** Palavras que nunca são valor de bloco/unidade — aparecem por acidente. */
const RUIDO = new Set([
  'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'A', 'O', 'AS', 'OS',
  'CEP', 'RUA', 'AV', 'AVN', 'AVENIDA', 'BAIRRO', 'CIDADE', 'ESTADO', 'UF',
  'NF', 'NFE', 'CPF', 'CNPJ', 'TEL', 'FONE', 'PED', 'PEDIDO',
]);

export function ehRuido(valor: string): boolean {
  return RUIDO.has(valor.toUpperCase());
}

/** Palavras que denunciam linha de endereço — não são nome de pessoa. */
const MARCADORES_ENDERECO = [
  'RUA', 'AVENIDA', 'TRAVESSA', 'ALAMEDA', 'RODOVIA', 'ESTRADA',
  'PRACA', 'LARGO', 'CEP', 'BAIRRO', 'CIDADE', 'MUNICIPIO', 'CONDOMINIO',
  'EDIFICIO', 'RESIDENCIAL',
];

export function pareceEndereco(linha: string): boolean {
  const n = normalizar(linha);
  return MARCADORES_ENDERECO.some((m) => n.includes(m));
}

/** Palavras de formulário/logística — nunca são o nome do morador. */
const MARCADORES_LOGISTICA = [
  'REMETENTE', 'DESTINATARIO', 'TRANSPORTADORA', 'NOTA FISCAL', 'DANFE',
  'PEDIDO', 'RASTREIO', 'OBJETO', 'VOLUME', 'PESO', 'ETIQUETA', 'ENTREGA',
  'CNPJ', 'CPF', 'INSCRICAO', 'CHAVE', 'SERIE', 'EMISSAO', 'TOTAL',
];

export function pareceLogistica(linha: string): boolean {
  const n = normalizar(linha);
  return MARCADORES_LOGISTICA.some((m) => n.includes(m));
}

/**
 * Heurística de "isto parece nome de pessoa".
 *
 * Conservadora de propósito: preencher o destinatário errado é pior que
 * deixá-lo vazio — o porteiro digita um nome em 3 segundos, mas não percebe
 * um nome trocado.
 */
export function pareceNomeDePessoa(linha: string): boolean {
  const n = normalizar(linha);
  if (n.length < 6 || n.length > 60) return false;
  if (/\d/.test(n)) return false;
  if (pareceEndereco(linha) || pareceLogistica(linha)) return false;

  const palavras = n.split(' ').filter((p) => p.length > 1);
  if (palavras.length < 2 || palavras.length > 6) return false;

  // Só letras e os separadores que aparecem em nome composto.
  return palavras.every((p) => /^[A-Z'-]+$/.test(p));
}
