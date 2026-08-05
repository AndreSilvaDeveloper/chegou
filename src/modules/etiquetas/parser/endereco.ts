/**
 * Endereço, complemento e destino (bloco / unidade / andar).
 *
 * O que este arquivo aprendeu com as etiquetas reais:
 *
 * - **A unidade quase nunca vem rotulada como `APTO`.** Ela vem em
 *   `Complemento:` (Mercado Livre) ou solta dentro do endereço
 *   (`..., 2288, Sala 1205 ed solar do progresso`, Shopee). Um parser que só
 *   procura palavra-chave de apartamento devolve `null` na maioria das
 *   etiquetas de prédio comercial.
 * - **`Complemento: 2009` é um número puro.** Não há palavra-chave nenhuma —
 *   quem diz que aquilo é a porta é o rótulo do campo, não o formato do valor.
 *   Por isso o número solto só vale vindo do campo rotulado: solto no meio do
 *   endereço ele é o número da rua repetido.
 * - **O endereço se quebra no meio.** `... 2288, Sala` / `1205 ed solar do
 *   progresso` são duas linhas do OCR e uma frase só, e a frase só se remonta
 *   dentro de uma zona de destino (ver `zonas.ts`).
 */
import { ESPACO, NUMERAL, SEP } from './padroes';
import { ehRuido } from './texto';

// ---------------------------------------------------------------------------
// Regex de destino
// ---------------------------------------------------------------------------

/**
 * Bloco aceita letra como valor, então o `\b` depois da palavra-chave é
 * obrigatório: sem ele, `TRANSPORTADORA` casaria `TR` + `ANSP`.
 *
 * O valor é apertado de propósito (`B`, `B2`, `02`, `123`) — capturar 4 letras
 * livres transforma qualquer palavra vizinha em nome de bloco.
 */
export const RE_BLOCO = new RegExp(
  `\\b(?:BLOCO|BLC|BL|TORRE|QUADRA|QD|TR)\\b${SEP}([A-Z]{1,2}\\d?|\\d{1,3})\\b`,
);

/**
 * Unidade. Aqui o valor é numérico, então NÃO se usa `\b` depois da
 * palavra-chave — é o que faz `APTO 302`, `AP.302` e `AP302` casarem igual.
 * Palavra maior vem primeiro na alternância (`APARTAMENTO` antes de `AP`).
 *
 * Grupos: 1 = letra de bloco colada (`APTO B102`), 2 = número, 3 = sufixo
 * (`302-B`, `302B`).
 *
 * `UN` ficou de fora: é a abreviação de "unidade" em bloco de **quantidade**
 * (`QTD 1 UN`), presente em quase toda etiqueta de e-commerce, e valia mais
 * como fonte de erro do que como acerto.
 *
 * Os dois lookaheads no fim rejeitam o que tem cara de unidade e não é:
 * unidade de medida colada (`2 KG`) e telefone (`CASA` seguido de `1234-5678`,
 * que produzia `numero = 1234`). Porta com hífen seguido de dígito não existe;
 * com hífen seguido de letra existe (`302-B`) e continua passando.
 */
export const RE_UNIDADE = new RegExp(
  `\\b(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UNID|UND|SALA|SL|CONJUNTO|CONJ|CASA|CS|LOTE|LT)` +
    `${SEP}${NUMERAL}([A-Z]${ESPACO})?(\\d{1,5})(${ESPACO}-${ESPACO}[A-Z]|[A-Z])?` +
    `(?!${ESPACO}(?:KG|G|ML|L|CM|MM|UN|PCS)\\b)(?!${ESPACO}-${ESPACO}\\d)\\b`,
);

export const RE_ANDAR = new RegExp(
  `\\b(?:(\\d{1,2})${ESPACO}(?:º|ª|O|A)?${ESPACO}ANDAR|ANDAR${SEP}(\\d{1,2})|PISO${SEP}(\\d{1,2}))\\b`,
);

/** `B-302`, `B 302` — usado só quando nada com palavra-chave apareceu. */
export const RE_COMPACTO = new RegExp(`\\b([A-Z])${ESPACO}[-/]${ESPACO}(\\d{2,4})\\b`);

/**
 * Onde um complemento começa dentro de uma linha de endereço.
 *
 * `(?![A-Z])` em vez de `\b` no fim: é o que faz `AP302` (sem espaço) cortar
 * igual a `AP 302`, sem deixar `APT` casar dentro de `APTO`.
 */
export const RE_INICIO_COMPLEMENTO = new RegExp(
  `\\b(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UNID|UND|SALA|SL|CONJUNTO|CONJ|CASA|CS|LOTE|LT|` +
    `BLOCO|BLC|BL|TORRE|QUADRA|QD|ANDAR|PISO|FUNDOS|SOBRELOJA|LOJA|GALPAO)(?![A-Z])`,
);

// ---------------------------------------------------------------------------
// Rótulos de campo
// ---------------------------------------------------------------------------

const RE_COMPLEMENTO_ROTULADO = new RegExp(`\\bCOMPLEMENTO${SEP}([^\\n]*)`);
const RE_ENDERECO_ROTULADO = new RegExp(
  `\\b(?:ENDERECO|LOGRADOURO|DELIVERY${ESPACO}ADDRESS|ADDRESS)${SEP}([^\\n]*)`,
);
const RE_BAIRRO_ROTULADO = new RegExp(`\\bBAIRRO${SEP}([^\\n]*)`);
const RE_CIDADE_ROTULADA = new RegExp(
  `\\b(?:CIDADE${ESPACO}DE${ESPACO}DESTINO|CIDADE|MUNICIPIO)${SEP}([^\\n]*)`,
);

/** Tipos de logradouro que abrem uma linha de endereço não rotulada. */
const RE_LINHA_DE_ENDERECO =
  /^(?:RUA|R|AVENIDA|AV|AVN|TRAVESSA|TV|ALAMEDA|AL|RODOVIA|ROD|ESTRADA|ESTR|PRACA|PC|LARGO|VILA|QUADRA)\b[.\s]/;

/**
 * Linha que abre um campo próprio — logo, não é continuação do endereço.
 *
 * É o que faz a remontagem da frase parar na hora certa: em
 * `... 2288, Sala` / `1205 ed solar` / `CEP: 36016-901`, as duas primeiras são
 * uma frase e a terceira é outro campo.
 */
const RE_ROTULO_DE_CAMPO = new RegExp(
  `^(?:CEP|BAIRRO|CIDADE|MUNICIPIO|ESTADO|UF|COMPLEMENTO|ENDERECO|LOGRADOURO|PEDIDO|ORDER|` +
    `TEL|TELEFONE|FONE|CPF|CNPJ|RG|IE|NF|NFE|DANFE|CHAVE|VENDA|PACK|SERVICO|ENVIO|NOME|` +
    `DESTINATARIO|REMETENTE|OBS|OBSERVACAO|REFERENCIA|RASTREIO|OBJETO)\\b`,
);

/**
 * Cauda que não é complemento: ponto de referência é texto livre que o
 * remetente digita, e vem colado no campo na etiqueta do Mercado Livre —
 * `Complemento: Sala 710 Referencia: Próximo ao Parque`.
 */
const RE_CAUDA_DO_COMPLEMENTO = new RegExp(
  `${ESPACO}\\b(?:REFERENCIA|REF|PONTO${ESPACO}DE${ESPACO}REFERENCIA|OBS|OBSERVACAO|PROXIMO)\\b.*$`,
);

const ESTADOS: ReadonlyArray<[string, string]> = [
  ['ACRE', 'AC'],
  ['ALAGOAS', 'AL'],
  ['AMAPA', 'AP'],
  ['AMAZONAS', 'AM'],
  ['BAHIA', 'BA'],
  ['CEARA', 'CE'],
  ['DISTRITO FEDERAL', 'DF'],
  ['ESPIRITO SANTO', 'ES'],
  ['GOIAS', 'GO'],
  ['MARANHAO', 'MA'],
  ['MATO GROSSO DO SUL', 'MS'],
  ['MATO GROSSO', 'MT'],
  ['MINAS GERAIS', 'MG'],
  ['PARAIBA', 'PB'],
  ['PARANA', 'PR'],
  ['PARA', 'PA'],
  ['PERNAMBUCO', 'PE'],
  ['PIAUI', 'PI'],
  ['RIO DE JANEIRO', 'RJ'],
  ['RIO GRANDE DO NORTE', 'RN'],
  ['RIO GRANDE DO SUL', 'RS'],
  ['RONDONIA', 'RO'],
  ['RORAIMA', 'RR'],
  ['SANTA CATARINA', 'SC'],
  ['SAO PAULO', 'SP'],
  ['SERGIPE', 'SE'],
  ['TOCANTINS', 'TO'],
];

const SIGLAS = new Set(ESTADOS.map(([, uf]) => uf));

/** `MINAS GERAIS`, `MG` e `BR-SP` chegam ao mesmo lugar; o resto, `null`. */
export function ufDe(texto: string): string | null {
  const t = texto.replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (SIGLAS.has(t)) return t;
  const comPrefixo = /^BR[-\s]?([A-Z]{2})$/.exec(t);
  if (comPrefixo && SIGLAS.has(comPrefixo[1])) return comPrefixo[1];
  for (const [nome, uf] of ESTADOS) if (nome === t) return uf;
  return null;
}

/**
 * Fatia uma linha de endereço nas partes que o remetente separou.
 *
 * Corta na vírgula, no ponto-e-vírgula e no ponto **depois de dígito**. Esse
 * último é o `sala 1502. Juiz de Fora` da Shopee — sem ele a cidade fica grudada
 * no complemento. A restrição a dígito é o que impede `AV. PAULISTA` de virar
 * duas partes.
 */
function fatiar(linha: string): string[] {
  return linha
    .split(/\s*[,;]\s*|(?<=\d)\.\s+/)
    .map((p) => p.trim().replace(/^[-–\s]+|[-–\s]+$/g, ''))
    .filter(Boolean);
}

function limpar(valor: string | undefined | null): string | null {
  const limpo = (valor ?? '').replace(/^[:.\-\s]+|[.,;\-\s]+$/g, '').trim();
  return limpo.length > 0 ? limpo : null;
}

/** Fim da última ocorrência de `re` em `texto`, ou -1. */
function ultimoFim(re: RegExp, texto: string): number {
  const global = new RegExp(re.source, 'g');
  let fim = -1;
  for (const m of texto.matchAll(global)) fim = m.index + m[0].length;
  return fim;
}

/**
 * Reduz o complemento à expressão que identifica a porta.
 *
 * `SALA 1205 ED SOLAR DO PROGRESS` vira `SALA 1205`, e `APTO 302 BLOCO B` fica
 * inteiro (o bloco também identifica a porta). O nome do edifício é informação
 * verdadeira e inútil para achar a unidade no cadastro; mantê-lo faz o gabarito
 * virar transcrição livre — duas pessoas conferindo a mesma amostra digitariam
 * coisas diferentes e o placar deixaria de significar alguma coisa.
 *
 * Complemento sem palavra-chave (`2009`) fica como está: ali o valor inteiro
 * **é** a porta.
 */
function enxugarComplemento(bruto: string): string {
  const semCauda = bruto.replace(RE_CAUDA_DO_COMPLEMENTO, '').trim();
  const inicio = RE_INICIO_COMPLEMENTO.exec(semCauda);
  const corte = inicio ? semCauda.slice(inicio.index) : semCauda;

  const fim = Math.max(ultimoFim(RE_UNIDADE, corte), ultimoFim(RE_BLOCO, corte));
  return (fim > 0 ? corte.slice(0, fim) : corte).trim();
}

export interface EnderecoLido {
  endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

const VAZIO: EnderecoLido = {
  endereco: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
};

/**
 * Interpreta uma linha de endereço corrida.
 *
 * A ordem das etapas não é estética: cidade e UF saem PRIMEIRO, pela cauda,
 * senão `Minas Gerais` vira bairro (é a última parte da linha) e `Juiz de Fora`
 * vira complemento.
 */
function analisarLinha(linha: string): EnderecoLido {
  const partes = fatiar(linha);
  if (partes.length === 0) return { ...VAZIO };

  let cidade: string | null = null;
  let uf: string | null = null;

  const ultima = partes[partes.length - 1];
  const comBarra = /^(.+)[\/-]\s*([A-Z]{2})$/.exec(ultima);
  if (ufDe(ultima)) {
    uf = ufDe(ultima);
    partes.pop();
    // A parte antes do estado é a cidade — quando sobra alguma além do
    // logradouro e ela não tem número. `Cidade de destino: . Minas Gerais` (a
    // cidade não imprimiu) tem que continuar sem cidade.
    if (partes.length > 1 && !/\d/.test(partes[partes.length - 1])) {
      cidade = partes.pop() ?? null;
    }
  } else if (comBarra && ufDe(comBarra[2])) {
    uf = ufDe(comBarra[2]);
    cidade = comBarra[1].trim();
    partes.pop();
  }

  // O logradouro vai até a parte que traz o número da porta da rua.
  const comNumero = partes.findIndex((p) => /\d/.test(p));
  const iNumero = comNumero < 0 ? 0 : comNumero;

  let endereco = partes.slice(0, iNumero + 1).join(', ');
  let complemento: string | null = null;

  // Complemento grudado no logradouro: `120 - Apto 302 Bloco B`.
  const inicio = RE_INICIO_COMPLEMENTO.exec(endereco);
  if (inicio && inicio.index > 0) {
    complemento = limpar(endereco.slice(inicio.index));
    endereco = endereco.slice(0, inicio.index);
  }

  let bairro: string | null = null;
  for (const parte of partes.slice(iNumero + 1)) {
    // Só palavra-chave promove uma parte a complemento. Número solto aqui é o
    // número da rua repetido (`... 2288, 2288, Solar do Progresso sala 1502`),
    // e aceitá-lo devolvia `2288` como se fosse a sala.
    if (!complemento && RE_INICIO_COMPLEMENTO.test(parte)) {
      complemento = limpar(parte);
      continue;
    }
    if (!bairro && !/\d/.test(parte)) bairro = limpar(parte);
  }

  return {
    endereco: limpar(endereco),
    complemento: complemento ? enxugarComplemento(complemento) : null,
    bairro,
    cidade: cidade ? limpar(cidade) : null,
    uf,
  };
}

/**
 * Remonta a frase que começa em `i`, juntando as linhas seguintes que são
 * continuação dela.
 *
 * É aqui que `... 2288, Sala` + `1205 ed solar do progresso` voltam a ser uma
 * frase só. Para em rótulo de campo novo, em começo de outro logradouro, em
 * linha sem letra nenhuma (código de triagem) e logo depois do estado — o
 * estado é o fim do endereço, e sem esse limite a frase engolia o bairro e a
 * cidade impressos noutra parte da etiqueta.
 */
function remontarFrase(linhas: string[], i: number): string {
  /** A última parte separada por vírgula — a vírgula final não conta. */
  const cauda = (linha: string) =>
    linha
      .split(/\s*,\s*/)
      .filter(Boolean)
      .pop() ?? '';

  const frase = [linhas[i]];
  if (ufDe(cauda(linhas[i]))) return frase.join(' ');

  for (const linha of linhas.slice(i + 1)) {
    if (RE_ROTULO_DE_CAMPO.test(linha)) break;
    if (RE_LINHA_DE_ENDERECO.test(linha)) break;
    if (!/[A-Z]/.test(linha)) break;
    frase.push(linha);
    if (ufDe(cauda(linha))) break;
  }
  return frase.join(' ');
}

/**
 * Lê endereço, complemento, bairro, cidade e UF das linhas de uma zona.
 *
 * Recebe as linhas e não o texto pronto porque a remontagem da frase é o ponto
 * inteiro: o endereço da etiqueta atravessa a quebra de linha do OCR.
 */
export function extrairEndereco(linhas: string[]): EnderecoLido {
  const texto = linhas.join(' \n ');

  const iRotulado = linhas.findIndex((l) => RE_ENDERECO_ROTULADO.test(l));
  const iSolto = linhas.findIndex((l) => RE_LINHA_DE_ENDERECO.test(l));

  let base = '';
  if (iRotulado >= 0) {
    const frase = remontarFrase(linhas, iRotulado);
    base = RE_ENDERECO_ROTULADO.exec(frase)?.[1] ?? '';
  } else if (iSolto >= 0) {
    base = remontarFrase(linhas, iSolto);
  }

  const lido = base.trim() ? analisarLinha(base) : { ...VAZIO };

  // Rótulo próprio ganha do que foi inferido da linha corrida: quando a
  // etiqueta separa o campo, ela está dizendo o que aquilo é.
  const complementoRotulado = limpar(RE_COMPLEMENTO_ROTULADO.exec(texto)?.[1]);
  const bairroRotulado = limpar(RE_BAIRRO_ROTULADO.exec(texto)?.[1]?.split(/[-\/,]/)[0]);
  const cidadeRotulada = RE_CIDADE_ROTULADA.exec(texto)?.[1];

  let cidade = lido.cidade;
  let uf = lido.uf;
  if (cidadeRotulada) {
    // `Cidade de destino: Juiz de Fora, Minas Gerais`: sem estado sobrando, a
    // cidade cai em `endereco` na análise genérica — é a primeira parte.
    const daLinha = analisarLinha(cidadeRotulada);
    const nome = daLinha.cidade ?? daLinha.endereco;
    if (nome && !/\d/.test(nome)) cidade = nome;
    uf = daLinha.uf ?? uf;
  }

  return {
    endereco: lido.endereco,
    complemento: complementoRotulado ? enxugarComplemento(complementoRotulado) : lido.complemento,
    bairro: bairroRotulado ?? lido.bairro,
    cidade,
    uf,
  };
}

// ---------------------------------------------------------------------------
// Destino
// ---------------------------------------------------------------------------

export interface DestinoLido {
  bloco: string | null;
  numero: string | null;
  andar: string | null;
}

/**
 * `BLOCO B - 302` / `BLOCO B 302`: o número vem depois do bloco, sem
 * palavra-chave de unidade. Só é consultado quando o bloco já foi identificado
 * e o número não — daí o lookahead no fim, para não engolir o começo de um CEP.
 */
function numeroDepoisDoBloco(texto: string, bloco: string): string | null {
  const re = new RegExp(
    `\\b(?:BLOCO|BLC|BL|TORRE|QD|TR)\\b${SEP}${bloco}${ESPACO}[-/]?${ESPACO}(\\d{1,5})(?!\\d)`,
  );
  return texto.match(re)?.[1] ?? null;
}

/**
 * Bloco, unidade e andar de um texto.
 *
 * `permitirCompacto` só é verdadeiro na varredura da etiqueta inteira: `B-302`
 * sozinho é ambíguo demais para sobrescrever o que uma palavra-chave já disse.
 */
export function extrairDestino(texto: string, permitirCompacto = true): DestinoLido {
  const mBloco = RE_BLOCO.exec(texto);
  const mUnidade = RE_UNIDADE.exec(texto);
  const mAndar = RE_ANDAR.exec(texto);

  let bloco = mBloco && !ehRuido(mBloco[1]) ? mBloco[1] : null;
  let numero: string | null = null;

  if (mUnidade) {
    numero = `${mUnidade[2]}${mUnidade[3]?.replace(/[\s-]/g, '') ?? ''}`;
    // `APTO B102`: a letra colada no número é o bloco, e só vale quando não há
    // um bloco declarado — o declarado sempre ganha do inferido.
    const prefixo = mUnidade[1]?.trim() || null;
    if (!bloco && prefixo) bloco = prefixo;
  }

  const andar = mAndar ? (mAndar[1] ?? mAndar[2] ?? mAndar[3] ?? null) : null;

  if (bloco && !numero) numero = numeroDepoisDoBloco(texto, bloco);

  if (permitirCompacto && !bloco && !numero) {
    const m = RE_COMPACTO.exec(texto);
    if (m) {
      bloco = m[1];
      numero = m[2];
    }
  }

  return { bloco, numero, andar };
}

/**
 * Destino a partir do complemento já isolado.
 *
 * O caso que só existe aqui é o complemento **sem palavra-chave nenhuma**:
 * `Complemento: 2009`. Quem garante que aquele número é a porta é o rótulo do
 * campo — e é por isso que este caminho existe separado da varredura de texto,
 * onde aceitar um número solto seria pegar peso, quantidade ou nota fiscal.
 */
export function destinoDoComplemento(complemento: string | null): DestinoLido {
  if (!complemento) return { bloco: null, numero: null, andar: null };

  const lido = extrairDestino(complemento, false);
  if (lido.numero || lido.bloco) return lido;

  // Número solto no começo do valor. Só chega aqui o complemento **rotulado**:
  // o complemento inferido de dentro do endereço sempre começa por
  // palavra-chave (`RE_INICIO_COMPLEMENTO`), então não há risco de o número da
  // rua entrar por esta porta.
  const solto = /^(\d{1,5})([A-Z]?)(?![\dA-Z])/.exec(complemento.replace(/^[\s.-]+/, ''));
  return solto ? { ...lido, numero: `${solto[1]}${solto[2]}` } : lido;
}
