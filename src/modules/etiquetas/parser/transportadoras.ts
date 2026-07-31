/**
 * Reconhecimento de transportadora.
 *
 * Duas frentes, porque a etiqueta dá duas pistas independentes: o nome escrito
 * e o formato do código de rastreio. Quando as duas concordam, ótimo; quando só
 * uma aparece, ela decide.
 *
 * Existe um primo disto no front (`web/src/pages/NovaEncomenda.tsx`), que roda
 * sobre o conteúdo do QR/código de barras — outra entrada, outro problema. Ao
 * acrescentar transportadora nova, olhe os dois.
 */

/**
 * Nome escrito na etiqueta.
 *
 * Ordem importa: o primeiro que casar vence — por isso as marcas próprias vêm
 * ANTES de `Correios`. Uma etiqueta do Mercado Livre que menciona "PAC" no
 * rodapé é do Mercado Livre; era ela que caía em Correios quando a linha dos
 * Correios vinha primeiro.
 *
 * `\s*` e não `\s?`: as linhas do OCR chegam unidas por `' \n '` (três
 * caracteres), então logotipo quebrado em duas linhas — `MERCADO` / `LIVRE`,
 * que é como a marca costuma ser impressa — nunca casava com `\s?`.
 *
 * **A grafia tem de ser idêntica à de `web/src/lib/transportadoras.ts`.** O
 * mesmo pacote lido por foto e digitado à mão precisa gerar a mesma string,
 * senão o relatório por transportadora se divide em duas linhas.
 */
const POR_NOME: ReadonlyArray<[string, RegExp]> = [
  ['Mercado Livre', /MERCADO\s*LIVRE|MERCADO\s*ENVIOS|\bMELI\b/],
  ['Shopee', /\bSHOPEE\b|\bSPX\b/],
  ['Amazon', /\bAMAZON\b/],
  ['Magalu', /\bMAGALU\b|MAGAZINE\s*LUIZA|\bLOGBEE\b/],
  ['AliExpress', /ALI\s*EXPRESS|\bCAINIAO\b/],
  ['Shein', /\bSHEIN\b/],
  ['Loggi', /\bLOGGI\b/],
  ['Jadlog', /\bJADLOG\b/],
  ['Total Express', /TOTAL\s*EXPRESS/],
  ['J&T Express', /\bJ&T\b|\bJT\s*EXPRESS\b/],
  ['Braspress', /\bBRASPRESS\b/],
  ['Azul Cargo', /AZUL\s*CARGO/],
  ['Rodonaves', /\bRODONAVES\b|\bRTE\b/],
  ['Jamef', /\bJAMEF\b/],
  ['Sequoia', /\bSEQUOIA\b/],
  ['Direct', /\bDIRECT\s*LOG\b/],
  ['Patrus', /\bPATRUS\b/],
  ['Rapidão Cometa', /RAPIDAO\s*COMETA|\bCOMETA\b/],
  ['GOL Log', /\bGOLLOG\b|\bGOL\s*LOG\b/],
  ['LATAM Cargo', /LATAM\s*CARGO/],
  ['DHL', /\bDHL\b/],
  ['FedEx', /\bFEDEX\b/],
  ['UPS', /\bUPS\b/],
  ['TNT', /\bTNT\b/],
  ['iFood', /\bIFOOD\b/],
  ['Rappi', /\bRAPPI\b/],
  // Por último: `PAC` e `SEDEX` aparecem no rodapé de etiqueta de marketplace
  // que só usa os Correios como transporte final.
  ['Correios', /\bCORREIOS\b|\bECT\b|\bSEDEX\b|\bPAC\b/],
];

/**
 * Formato do código de rastreio. Só entram formatos com prefixo próprio —
 * código puramente numérico é ambíguo entre transportadoras e não decide nada.
 */
const POR_CODIGO: ReadonlyArray<[string, RegExp]> = [
  ['Correios', /^[A-Z]{2}\d{9}[A-Z]{2}$/],
  ['Amazon', /^TBA\d{9,}$/],
  // `BR…` saiu daqui: é prefixo genérico nacional, usado por várias
  // transportadoras, e rotulava como Shopee pacote que não era dela.
  ['Shopee', /^SPX[A-Z0-9]{6,}$/],
  ['J&T Express', /^J[TD]\d{8,}$/],
  ['AliExpress', /^(LP|AE|UF)\d{8,}[A-Z]{0,2}$/],
];

/** `texto` deve vir de `normalizar()` — maiúscula e sem acento. */
export function detectarPorTexto(texto: string): string | null {
  for (const [nome, re] of POR_NOME) {
    if (re.test(texto)) return nome;
  }
  return null;
}

export function detectarPorCodigo(codigo: string | null): string | null {
  if (!codigo) return null;
  const c = codigo.toUpperCase();
  for (const [nome, re] of POR_CODIGO) {
    if (re.test(c)) return nome;
  }
  return null;
}
