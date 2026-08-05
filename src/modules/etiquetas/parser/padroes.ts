/**
 * Primitivas de regex compartilhadas pelo parser.
 *
 * Ficam aqui e não em cada arquivo porque as três primeiras (`ESPACO`, `SEP`,
 * `NUMERAL`) são a defesa contra a classe de bug mais cara que este módulo já
 * teve — e defesa que cada arquivo reescreve do seu jeito deixa de ser defesa.
 */

/**
 * Espaço que **não** atravessa a quebra de linha.
 *
 * As linhas do OCR chegam unidas por `' \n '`, e `\s*` casa `\n`. Com ele, uma
 * etiqueta com `QTD 1 UN` numa linha e `0,350 KG` na seguinte produzia
 * `numero = 0` — e, como `String.match` devolve a primeira ocorrência do blob,
 * esse zero VENCIA o `APTO 51` verdadeiro impresso mais abaixo. Campo
 * preenchido com valor errado é o pior desfecho possível aqui: o porteiro
 * confirma sem desconfiar e a encomenda vai para a unidade errada.
 *
 * Toda regex que atravessa um separador no parser usa isto, nunca `\s`.
 */
export const ESPACO = '[^\\S\\n]*';

/** Separador entre a palavra-chave e o valor: `APTO 302`, `AP.302`, `AP-302`. */
export const SEP = `${ESPACO}[:.\\-]?${ESPACO}`;

/** `Nº`, `N°`, `N.`, `NO` entre a palavra-chave e o número: `APTO Nº 302`. */
export const NUMERAL = `(?:N[º°O]?\\.?${ESPACO})?`;

/**
 * CEP. Os lookarounds impedem recortar 8 dígitos de dentro de um número maior —
 * nota fiscal, chave de acesso da DANFE (44 dígitos) ou NCM da declaração de
 * alfândega, que tem exatos 8 e viraria `63049-900` sem eles.
 */
export const RE_CEP = /(?<!\d)(\d{5})-?(\d{3})(?!\d)/;

/** Só os dígitos — a forma em que dois CEPs se comparam. */
export function digitosDoCep(cep: string | null | undefined): string {
  return (cep ?? '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// Marcadores de zona
// ---------------------------------------------------------------------------

/**
 * Sem variante acentuada: o texto já passou por `normalizar()`.
 *
 * A pontuação é **opcional** para os rótulos inequívocos: etiqueta que imprime
 * `DESTINATÁRIO` sozinho dentro de uma tarja (o normal em Shopee e Mercado
 * Livre) não casava, e o parser caía na heurística global — que é justamente a
 * que pode devolver o remetente.
 *
 * `PARA` continua exigindo pontuação, e por isso vai numa alternativa separada:
 * sem ela, a preposição solta em qualquer frase da etiqueta viraria um rótulo.
 */
export const MARCA_DESTINATARIO =
  /\b(?:DESTINATARIO|DESTINATARIA|DEST|RECEBEDOR|ENTREGAR PARA|ENTREGAR A|ENTREGA A|ENTREGAR EM|SHIP TO|RECIPIENT|A\/C)\b[^\S\n]*[:.\-]?|\bPARA[^\S\n]*[:.\-]/;

export const MARCA_REMETENTE = /\bREMETENTE\b|\bSENDER\b|\bDE[^\S\n]*:/;

/**
 * Bloco de devolução / logística reversa.
 *
 * Vale como zona própria e não como "remetente" porque o endereço que ele
 * carrega é o de um galpão em outra cidade — o caso mais perigoso da etiqueta
 * da Shopee, que traz esse endereço completo, com CEP, logo abaixo do destino.
 */
export const MARCA_DEVOLUCAO = new RegExp(
  `\\bDEVOLUCAO\\b|\\bREVERSA\\b|RETORNO${ESPACO}A${ESPACO}ORIGEM|` +
    `EM${ESPACO}CASO${ESPACO}DE${ESPACO}NAO${ESPACO}ENTREGA|ENCAMINHAR${ESPACO}PARA|RETURN${ESPACO}TO`,
);

/**
 * Pistas de que o bloco é o do destino sem que a etiqueta diga "destinatário".
 *
 * É o formato do Mercado Livre: nome, `Endereço:`, `CEP:`, `Cidade de destino:`
 * e `Complemento:` — nenhum rótulo de destinatário em lugar nenhum. Sem isto o
 * parser caía na varredura global e devolvia o nome do REMETENTE impresso no
 * alto da etiqueta, que nessas transportadoras é uma pessoa física.
 */
export const MARCA_DESTINO_FRACA = new RegExp(
  `\\bENDERECO\\b|\\bCOMPLEMENTO\\b|CIDADE${ESPACO}DE${ESPACO}DESTINO|\\bBAIRRO\\b|\\bDELIVERY${ESPACO}ADDRESS\\b`,
);

/** Formulário, fiscal e alfândega — nunca é onde mora o nome do morador. */
export const MARCA_LOGISTICA = new RegExp(
  `DECLARACAO${ESPACO}PARA${ESPACO}ALFANDEGA|\\bDANFE\\b|NOTA${ESPACO}FISCAL|CHAVE${ESPACO}DE${ESPACO}ACES|` +
    `\\bCNPJ\\b|\\bNCM\\b|VALOR${ESPACO}BRL|PESO${ESPACO}(?:KG|BRUTO|LIQUIDO)|\\bFRETE\\b|\\bSEGURO\\b|` +
    `\\bQTDE?\\b|\\bVOLUMES?\\b|\\bTAXPAYMENT\\b|\\bREMESSA${ESPACO}CONFORME\\b`,
);
