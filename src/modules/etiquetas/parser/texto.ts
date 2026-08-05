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

/**
 * Monta um teste de **palavra inteira** a partir de uma lista de marcadores.
 *
 * Por que não `includes`: `n.includes('CHAVE')` reprova "Maria Chaves Souza",
 * `'PRACA'` reprova "Ana Cristina Praça" e `'TOTAL'` reprova "Roberto Total
 * Nunes" — todos nomes de morador legítimos que a etiqueta trazia certos e o
 * parser jogava fora. São nomes reais de gente real; o `\b` é o que os salva.
 */
function testeDePalavras(marcadores: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${marcadores.join('|')})\\b`);
}

/**
 * Tipos de logradouro — só valem como endereço **no começo da linha**.
 *
 * `PRAÇA`, `LARGO` e `CAMPOS` são sobrenomes brasileiros correntes: "Ana
 * Cristina Praça" é moradora, "Praça da Liberdade 50" é endereço. O que
 * distingue os dois não é a palavra, é a posição — o tipo de logradouro abre a
 * linha, o sobrenome nunca. Sem essa distinção o parser descartava o nome da
 * moradora e caía no fallback global, que é a rota para devolver o remetente.
 */
const LOGRADOUROS = [
  'RUA', 'R', 'AVENIDA', 'AV', 'TRAVESSA', 'TV', 'ALAMEDA', 'AL',
  'RODOVIA', 'ROD', 'ESTRADA', 'ESTR', 'PRACA', 'PC', 'LARGO', 'VILA',
];

const RE_LOGRADOURO = new RegExp(`^(?:${LOGRADOUROS.join('|')})\\b`);

/** Palavras que denunciam endereço **em qualquer posição** da linha. */
const MARCADORES_ENDERECO = [
  'CEP', 'BAIRRO', 'CIDADE', 'MUNICIPIO', 'CONDOMINIO',
  'EDIFICIO', 'RESIDENCIAL', 'LOTEAMENTO',
];

const RE_ENDERECO = testeDePalavras(MARCADORES_ENDERECO);

export function pareceEndereco(linha: string): boolean {
  const n = normalizar(linha);
  return RE_LOGRADOURO.test(n) || RE_ENDERECO.test(n);
}

/** Palavras de formulário/logística — nunca são o nome do morador. */
const MARCADORES_LOGISTICA = [
  'REMETENTE', 'DESTINATARIO', 'TRANSPORTADORA', 'NOTA FISCAL', 'DANFE',
  'PEDIDO', 'RASTREIO', 'OBJETO', 'VOLUME', 'PESO', 'ETIQUETA', 'ENTREGA',
  'CNPJ', 'CPF', 'INSCRICAO', 'CHAVE', 'SERIE', 'EMISSAO', 'TOTAL',
];

/**
 * Marcas de pessoa **jurídica**. Sem elas, "MERCADO LIVRE BRASIL LTDA" e
 * "Loja Fulano ME" passavam como nome de pessoa — e viravam o destinatário
 * quando o remetente aparecia antes na etiqueta.
 */
const MARCADORES_EMPRESA = [
  'LTDA', 'EPP', 'EIRELI', 'MEI', 'CIA',
  'COMERCIO', 'COMERCIAL', 'INDUSTRIA', 'DISTRIBUIDORA', 'ATACADO',
  'LOJA', 'LOJAS', 'MAGAZINE', 'IMPORTADORA', 'SERVICOS', 'REPRESENTACOES',
  // `SA` e `ME` ficam de fora de propósito: `Sá` é sobrenome brasileiro comum e
  // reprovar "Ana Maria Sá" custa mais do que aceitar uma razão social a mais.
];

const RE_EMPRESA = testeDePalavras(MARCADORES_EMPRESA);

/**
 * Linha que é razão social, não nome de gente.
 *
 * É predicado próprio (e não só mais um marcador de ruído) porque quem consome
 * precisa distinguir os dois casos: "não é nome de pessoa" e "é o nome de uma
 * empresa". Na zona do remetente essa diferença decide tudo — a loja que enviou
 * ocupa o lugar do nome do remetente, e o primeiro nome de PESSOA depois dela
 * já é o destinatário.
 */
export function pareceEmpresa(linha: string): boolean {
  return RE_EMPRESA.test(normalizar(linha));
}

const RE_LOGISTICA = testeDePalavras([...MARCADORES_LOGISTICA, ...MARCADORES_EMPRESA]);

export function pareceLogistica(linha: string): boolean {
  return RE_LOGISTICA.test(normalizar(linha));
}

/**
 * Tira da linha o que vem entre parênteses.
 *
 * O Mercado Livre imprime o apelido da conta logo depois do nome, na mesma
 * linha: `Ester de Lemos Guimarães (TXGRUPPI)`, `Hergisson Pereira da Costa` /
 * `(SHEILARAKAUSKAS)`. Como a validação de nome é palavra a palavra, o
 * parêntese reprovava a linha inteira, o destinatário vinha `null` e — sem
 * rótulo de destinatário nessas etiquetas — a varredura global devolvia o nome
 * do REMETENTE impresso no alto. Nome trocado, e ninguém confere campo que já
 * veio preenchido.
 *
 * O apelido é descartado de propósito: quem casa com o cadastro do condomínio é
 * o nome civil.
 */
export function semApelido(linha: string): string {
  return linha.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Heurística de "isto parece nome de pessoa".
 *
 * Conservadora de propósito: preencher o destinatário errado é pior que
 * deixá-lo vazio — o porteiro digita um nome em 3 segundos, mas não percebe
 * um nome trocado.
 */
export function pareceNomeDePessoa(linha: string): boolean {
  return nomeDePessoa(linha) !== null;
}

/**
 * O nome de pessoa contido na linha, na forma canônica — ou `null`.
 *
 * Devolve o valor em vez de só um booleano porque quem chama precisa do nome
 * **limpo**: é ele que vai comparar com o cadastro de moradores, e o apelido
 * entre parênteses não casa com nada.
 */
export function nomeDePessoa(linha: string): string | null {
  const n = semApelido(normalizar(linha));
  if (n.length < 6 || n.length > 60) return null;
  if (/\d/.test(n)) return null;
  if (pareceEndereco(n) || pareceLogistica(n)) return null;

  // Vírgula de "SOBRENOME, NOME" não descaracteriza um nome — ela é justamente
  // como parte das etiquetas imprime o destinatário.
  const palavras = n.replace(/,/g, ' ').split(' ').filter((p) => p.length > 1);
  if (palavras.length < 2 || palavras.length > 7) return null;

  // Só letras e os separadores que aparecem em nome composto. O ponto final é
  // aceito por causa da inicial abreviada, comuníssima: `MARIA A. SILVA`.
  return palavras.every((p) => /^[A-Z][A-Z'-]*\.?$/.test(p)) ? n : null;
}
