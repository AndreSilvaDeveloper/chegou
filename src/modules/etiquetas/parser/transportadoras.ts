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

/** Nome escrito na etiqueta. Ordem importa: o primeiro que casar vence. */
const POR_NOME: ReadonlyArray<[string, RegExp]> = [
  ['Correios', /\bCORREIOS\b|\bECT\b|\bSEDEX\b|\bPAC\b/],
  ['Mercado Livre', /MERCADO\s?LIVRE|MERCADO\s?ENVIOS|\bMELI\b/],
  ['Shopee', /\bSHOPEE\b|\bSPX\b/],
  ['Amazon', /\bAMAZON\b/],
  ['Loggi', /\bLOGGI\b/],
  ['Jadlog', /\bJADLOG\b/],
  ['Total Express', /TOTAL\s?EXPRESS/],
  ['J&T Express', /\bJ&T\b|\bJT\s?EXPRESS\b/],
  ['Azul Cargo', /AZUL\s?CARGO/],
  ['Braspress', /\bBRASPRESS\b/],
  ['DHL', /\bDHL\b/],
  ['FedEx', /\bFEDEX\b/],
  ['Latam Cargo', /LATAM\s?CARGO/],
];

/**
 * Formato do código de rastreio. Só entram formatos com prefixo próprio —
 * código puramente numérico é ambíguo entre transportadoras e não decide nada.
 */
const POR_CODIGO: ReadonlyArray<[string, RegExp]> = [
  ['Correios', /^[A-Z]{2}\d{9}[A-Z]{2}$/],
  ['Amazon', /^TBA\d{9,}$/],
  ['Shopee', /^(SPX|BR)[A-Z0-9]{8,}$/],
  ['J&T Express', /^J[TD]\d{8,}$/],
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
