import type { CamposEtiqueta, LinhaOcr } from '../../../database/entities';
import { detectarPorCodigo, detectarPorTexto } from './transportadoras';
import {
  digitosProvaveis,
  ehRuido,
  letrasProvaveis,
  normalizar,
  pareceNomeDePessoa,
} from './texto';

/**
 * Versão do parser, gravada em cada amostra reprocessada.
 *
 * **Suba a cada mudança de regra.** É o que permite olhar o placar e dizer "a
 * v3 melhorou o bloco e piorou o destinatário" em vez de discutir de memória.
 */
export const PARSER_VERSAO = '1';

const VAZIO: CamposEtiqueta = {
  destinatario: null,
  bloco: null,
  numero: null,
  andar: null,
  transportadora: null,
  codigoRastreio: null,
  cep: null,
};

// ---------------------------------------------------------------------------
// Código de rastreio
// ---------------------------------------------------------------------------

/**
 * Formatos com assinatura própria. Testados nesta ordem: do mais específico
 * (que praticamente não dá falso positivo) para o mais genérico.
 */
const FORMATOS_RASTREIO: RegExp[] = [
  /\b[A-Z]{2}\d{9}[A-Z]{2}\b/, // Correios
  /\bTBA\d{9,}\b/, // Amazon
  /\bSPX[A-Z0-9]{6,}\b/, // Shopee
  /\bBR\d{10,}\b/, // Shopee / genérico nacional
  /\bJ[TD]\d{8,}\b/, // J&T
];

/** Rótulos que antecedem o código quando ele não tem formato reconhecível. */
const ROTULO_RASTREIO =
  /(?:RASTREIO|RASTREAMENTO|OBJETO|AWB|TRACKING)\s*[:.\-]?\s*([A-Z0-9]{8,30})\b/;

function extrairRastreio(texto: string): string | null {
  for (const re of FORMATOS_RASTREIO) {
    const m = texto.match(re);
    if (m) return m[0];
  }

  // O padrão dos Correios é rígido (2 letras + 9 dígitos + 2 letras), então dá
  // para consertar a confusão do OCR com segurança: onde tem que ser letra,
  // força letra; onde tem que ser dígito, força dígito. Só aqui — em texto
  // livre esse conserto destrói mais do que salva.
  const candidato = texto.match(/\b[A-Z0-9]{13}\b/);
  if (candidato) {
    const c = candidato[0];
    const corrigido =
      letrasProvaveis(c.slice(0, 2)) +
      digitosProvaveis(c.slice(2, 11)) +
      letrasProvaveis(c.slice(11, 13));
    if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(corrigido)) return corrigido;
  }

  const rotulado = texto.match(ROTULO_RASTREIO);
  if (rotulado && /\d/.test(rotulado[1])) return rotulado[1];

  return null;
}

// ---------------------------------------------------------------------------
// CEP
// ---------------------------------------------------------------------------

// Lookarounds impedem recortar 8 dígitos de dentro de um número maior (nota
// fiscal, código de barras numérico).
const CEP = /(?<!\d)(\d{5})-?(\d{3})(?!\d)/;

function extrairCep(linhas: string[], texto: string): string | null {
  // Linha que diz "CEP" é a fonte confiável; o resto é palpite.
  const comRotulo = linhas.find((l) => l.includes('CEP'));
  const m = (comRotulo && comRotulo.match(CEP)) || texto.match(CEP);
  return m ? `${m[1]}-${m[2]}` : null;
}

// ---------------------------------------------------------------------------
// Destino (bloco / unidade / andar)
// ---------------------------------------------------------------------------

/**
 * Bloco aceita letra como valor, então o `\b` depois da palavra-chave é
 * obrigatório: sem ele, `TRANSPORTADORA` casaria `TR` + `ANSP`.
 *
 * O valor é apertado de propósito (`B`, `B2`, `02`, `123`) — capturar 4 letras
 * livres transforma qualquer palavra vizinha em nome de bloco.
 */
const BLOCO = /\b(?:BLOCO|BLC|BL|TORRE|QUADRA|QD|TR)\b\s*[:.\-]?\s*([A-Z]{1,2}\d?|\d{1,3})\b/;

/**
 * Unidade. Aqui o valor é numérico, então NÃO se usa `\b` depois da
 * palavra-chave — é o que faz `APTO 302`, `AP.302` e `AP302` casarem igual.
 * Palavra maior vem primeiro na alternância (`APARTAMENTO` antes de `AP`).
 */
const UNIDADE =
  /\b(?:APARTAMENTO|APTO|APT|AP|UNIDADE|UNID|UND|UN|SALA|SL|CONJUNTO|CONJ|CASA|LOTE|LT)\s*[:.\-]?\s*(\d{1,5}[A-Z]?)\b/;

const ANDAR = /\b(?:(\d{1,2})\s*(?:º|O|A)?\s*ANDAR|ANDAR\s*[:.\-]?\s*(\d{1,2})|PISO\s*[:.\-]?\s*(\d{1,2}))\b/;

/** `B-302`, `B 302` — usado só quando nada com palavra-chave apareceu. */
const COMPACTO = /\b([A-Z])\s*[-/]\s*(\d{2,4})\b/;

function extrairDestino(texto: string): Pick<CamposEtiqueta, 'bloco' | 'numero' | 'andar'> {
  const mBloco = texto.match(BLOCO);
  const mUnidade = texto.match(UNIDADE);
  const mAndar = texto.match(ANDAR);

  let bloco = mBloco && !ehRuido(mBloco[1]) ? mBloco[1] : null;
  let numero = mUnidade ? mUnidade[1] : null;
  // A regex de andar tem três alternativas; vale a que capturou.
  const andar = mAndar ? (mAndar[1] ?? mAndar[2] ?? mAndar[3] ?? null) : null;

  // Último recurso, e só quando falta os dois: `B-302` sozinho é ambíguo
  // demais para sobrescrever qualquer coisa que uma palavra-chave já disse.
  if (!bloco && !numero) {
    const m = texto.match(COMPACTO);
    if (m) {
      bloco = m[1];
      numero = m[2];
    }
  }

  return { bloco, numero, andar };
}

// ---------------------------------------------------------------------------
// Destinatário
// ---------------------------------------------------------------------------

// Sem variante acentuada: o texto já passou por `normalizar()`.
const MARCA_DESTINATARIO = /\b(?:DESTINATARIO|ENTREGAR A|ENTREGA A|PARA)\s*[:.\-]/;
const MARCA_REMETENTE = /\bREMETENTE\b|\bDE\s*:/;

/**
 * Prioriza o bloco marcado como destinatário. Só cai na heurística de "parece
 * nome de gente" quando a etiqueta não tem rótulo nenhum — e mesmo aí, pulando
 * a região do remetente, que também tem um nome de pessoa e é a fonte clássica
 * de erro (notificar o morador com o nome de quem enviou).
 */
function extrairDestinatario(linhas: string[]): string | null {
  const iDest = linhas.findIndex((l) => MARCA_DESTINATARIO.test(l));

  if (iDest >= 0) {
    // O nome costuma vir depois do rótulo, na mesma linha...
    const depoisDoRotulo = linhas[iDest].split(MARCA_DESTINATARIO)[1]?.trim();
    if (depoisDoRotulo && pareceNomeDePessoa(depoisDoRotulo)) return depoisDoRotulo;

    // ...ou na linha de baixo.
    for (const l of linhas.slice(iDest + 1, iDest + 3)) {
      if (pareceNomeDePessoa(l)) return l;
    }
  }

  // Sem rótulo de destinatário, o único ponto de apoio é o remetente: o
  // primeiro nome de pessoa DEPOIS dele é o remetente, e é justamente esse que
  // não pode ser escolhido. Descartar uma janela fixa de linhas não serve —
  // bloco de remetente tem tamanho variável (com ou sem endereço, CNPJ, tel),
  // e a janela ora engole o destinatário ora deixa o remetente passar.
  const iRem = linhas.findIndex((l) => MARCA_REMETENTE.test(l));
  const iNomeRemetente =
    iRem >= 0 ? linhas.findIndex((l, i) => i > iRem && pareceNomeDePessoa(l)) : -1;

  const candidato = linhas.findIndex((l, i) => i !== iNomeRemetente && pareceNomeDePessoa(l));
  return candidato >= 0 ? linhas[candidato] : null;
}

// ---------------------------------------------------------------------------

/**
 * Lê os campos da encomenda a partir das linhas devolvidas pelo OCR.
 *
 * Nunca lança: linha ilegível vira campo `null`. Quem consome trata tudo como
 * sugestão — a tela sempre pede confirmação do porteiro.
 */
export function extrairCampos(linhas: LinhaOcr[]): CamposEtiqueta {
  if (!linhas?.length) return { ...VAZIO };

  const normalizadas = linhas.map((l) => normalizar(l.texto)).filter(Boolean);
  const texto = normalizadas.join(' \n ');

  const codigoRastreio = extrairRastreio(texto);
  const destino = extrairDestino(texto);

  return {
    ...destino,
    destinatario: extrairDestinatario(normalizadas),
    codigoRastreio,
    // O nome escrito vale mais que o formato do código: uma etiqueta da Shopee
    // pode carregar um objeto postado nos Correios.
    transportadora: detectarPorTexto(texto) ?? detectarPorCodigo(codigoRastreio),
    cep: extrairCep(normalizadas, texto),
  };
}

/** Atalho para teste e para reprocessar amostra a partir de texto solto. */
export function extrairDeTexto(linhas: string[]): CamposEtiqueta {
  return extrairCampos(
    linhas.map((texto) => ({ texto, confianca: 1, box: [0, 0, 0, 0] as [number, number, number, number] })),
  );
}
