import type { CamposEtiqueta, LinhaOcr } from '../../../database/entities';
import {
  destinoDoComplemento,
  extrairDestino,
  extrairEndereco,
  type DestinoLido,
  type EnderecoLido,
} from './endereco';
import { prepararLinhas, SEPARADOR } from './geometria';
import { MARCA_DESTINATARIO, MARCA_REMETENTE, RE_CEP, SEP } from './padroes';
import { detectarPorCodigo, detectarPorTexto } from './transportadoras';
import { digitosProvaveis, letrasProvaveis, nomeDePessoa, pareceEmpresa } from './texto';
import { zonaDeDestino, zonear, type BlocoZonado, type Condominio, type Destino } from './zonas';

/**
 * Versão do parser, gravada em cada amostra reprocessada.
 *
 * **Suba a cada mudança de regra.** É o que permite olhar o placar e dizer "a
 * v3 melhorou o bloco e piorou o destinatário" em vez de discutir de memória.
 *
 * v3: as linhas voltaram a ter posição. O parser agrupa por geometria
 * (`geometria.ts`), classifica cada bloco (`zonas.ts`) e só então extrai — em
 * vez de rodar regex sobre a etiqueta inteira concatenada, onde a primeira
 * ocorrência vence e a primeira costuma ser a do remetente.
 */
export const PARSER_VERSAO = '3';

const VAZIO: CamposEtiqueta = {
  destinatario: null,
  endereco: null,
  complemento: null,
  bloco: null,
  numero: null,
  andar: null,
  bairro: null,
  cidade: null,
  uf: null,
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
const ROTULO_RASTREIO = new RegExp(
  `(?:RASTREIO|RASTREAMENTO|OBJETO|AWB|TRACKING)${SEP}([A-Z0-9]{8,30})\\b`,
);

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

/** Linha que diz "CEP" é a fonte confiável; o resto é palpite. */
function extrairCep(linhas: string[]): string | null {
  const comRotulo = linhas.find((l) => l.includes('CEP'));
  const m = (comRotulo && comRotulo.match(RE_CEP)) || linhas.join(SEPARADOR).match(RE_CEP);
  return m ? `${m[1]}-${m[2]}` : null;
}

// ---------------------------------------------------------------------------
// Destinatário
// ---------------------------------------------------------------------------

/**
 * O nome dentro da zona de destino.
 *
 * Dois caminhos, e a diferença entre eles é o que a etiqueta declarou:
 *
 * - **Zona rotulada** (`DESTINATÁRIO:`): o nome está no resto da linha do
 *   rótulo ou logo abaixo. Não achou ali → devolve `null`. Cair na varredura
 *   global seria pegar o primeiro nome da etiqueta, que quando o bloco do
 *   remetente vem antes (Shopee, Mercado Livre) é quem enviou.
 * - **Zona inferida** (`Endereço:` / `Complemento:` e nenhum rótulo): o nome é
 *   a primeira linha de gente do bloco — na prática, a linha logo acima do
 *   endereço, que é como o Mercado Livre imprime.
 */
function destinatarioDaZona(destino: Destino, blocos: BlocoZonado[]): string | null {
  const linhas = destino.bloco.linhas.map((l) => l.texto);

  if (destino.bloco.rotulada) {
    const iRotulo = linhas.findIndex((l) => MARCA_DESTINATARIO.test(l));
    if (iRotulo >= 0) {
      const depoisDoRotulo = linhas[iRotulo].split(MARCA_DESTINATARIO)[1]?.trim();
      const naMesmaLinha = depoisDoRotulo ? nomeDePessoa(depoisDoRotulo) : null;
      if (naMesmaLinha) return naMesmaLinha;

      for (const linha of linhas.slice(iRotulo + 1, iRotulo + 4)) {
        const nome = nomeDePessoa(linha);
        if (nome) return nome;
      }
      return null;
    }
  }

  for (const linha of linhas) {
    const nome = nomeDePessoa(linha);
    if (nome) return nome;
  }

  // O nome pode ter caído no bloco de cima quando a etiqueta imprime uma régua
  // entre ele e o endereço. Só o vizinho imediato, e só se ele não for de
  // ninguém: bloco de remetente ou de devolução nunca doa nome ao destino.
  const anterior = blocos[destino.indices[0] - 1];
  return anterior && anterior.zona === 'indefinida' ? nomeDePessoa(anterior.texto) : null;
}

/**
 * Varredura global — só quando a etiqueta não tem zona de destino nenhuma.
 *
 * O único ponto de apoio é o remetente: o primeiro nome de pessoa DEPOIS dele é
 * o remetente, e é justamente esse que não pode ser escolhido. Descartar uma
 * janela fixa de linhas não serve — bloco de remetente tem tamanho variável
 * (com ou sem endereço, CNPJ, telefone), e a janela ora engole o destinatário
 * ora deixa o remetente passar.
 *
 * Quem ocupa o lugar do remetente pode ser uma pessoa OU uma loja, e essa
 * diferença decide o resultado: procurando só por nome de pessoa, uma etiqueta
 * cujo remetente é "Loja Fulano ME" fazia o primeiro nome de gente da etiqueta
 * (que já é o destinatário) ser descartado como se fosse o remetente.
 */
function destinatarioGlobal(linhas: string[]): string | null {
  const iRem = linhas.findIndex((l) => MARCA_REMETENTE.test(l));
  const iNomeRemetente =
    iRem >= 0
      ? linhas.findIndex((l, i) => i > iRem && (nomeDePessoa(l) !== null || pareceEmpresa(l)))
      : -1;

  for (let i = 0; i < linhas.length; i++) {
    if (i === iNomeRemetente) continue;
    const nome = nomeDePessoa(linhas[i]);
    if (nome) return nome;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Confiança
// ---------------------------------------------------------------------------

/** De onde o campo veio — é o que gradua a confiança. */
export type Origem = 'zona' | 'global';

/**
 * Teto de confiança do que foi garimpado na etiqueta inteira.
 *
 * Mesma ideia do perfil genérico do parser de etiqueta de gôndola do Poupe no
 * Mercado: o caminho que sempre casa nunca casa com convicção. Sem zona de
 * destino identificada, o valor pode ter vindo do bloco do remetente.
 */
const TETO_GLOBAL = 0.55;

/** Abaixo disto o campo entra em `camposFracos`. */
const LIMIAR_FRACO = 0.6;

export interface Diagnostico {
  campos: CamposEtiqueta;
  /** 0..1 para cada campo preenchido. Campo `null` não aparece aqui. */
  confianca: Partial<Record<keyof CamposEtiqueta, number>>;
  /**
   * Campos preenchidos em que não se deve confiar sem olhar. A tela da portaria
   * usa isto para marcar onde o porteiro precisa conferir duas vezes.
   */
  camposFracos: (keyof CamposEtiqueta)[];
  /** As zonas encontradas, para depurar uma leitura ruim sem adivinhação. */
  zonas: {
    zona: BlocoZonado['zona'];
    certeza: number;
    motivo: string;
    linhas: number;
  }[];
}

export interface OpcoesParser {
  /**
   * O que o condomínio sabe sobre si mesmo. Com o CEP cadastrado, o bloco que o
   * traz impresso É o bloco de destino — nenhuma heurística chega perto disso.
   */
  condominio?: Condominio;
}

/** Primeiro candidato não nulo, junto com a origem dele. */
function escolher(...candidatos: [string | null, Origem][]): [string | null, Origem] {
  for (const [valor, origem] of candidatos) if (valor !== null) return [valor, origem];
  return [null, 'global'];
}

// ---------------------------------------------------------------------------

/**
 * Lê os campos da encomenda a partir das linhas devolvidas pelo OCR, com a
 * confiança de cada um.
 *
 * Nunca lança: linha ilegível vira campo `null`. Quem consome trata tudo como
 * sugestão — a tela sempre pede confirmação do porteiro.
 */
export function extrairComDiagnostico(linhas: LinhaOcr[], opcoes: OpcoesParser = {}): Diagnostico {
  const vazio: Diagnostico = {
    campos: { ...VAZIO },
    confianca: {},
    camposFracos: [],
    zonas: [],
  };
  if (!linhas?.length) return vazio;

  const preparo = prepararLinhas(linhas);
  if (preparo.linhas.length === 0) return vazio;

  const blocos = zonear(preparo, opcoes.condominio);
  const destino = zonaDeDestino(blocos);

  const todas = preparo.linhas.map((l) => l.texto);
  const textoGlobal = todas.join(SEPARADOR);
  const linhasDoDestino = destino?.bloco.linhas.map((l) => l.texto) ?? [];

  // Para o caminho global, tudo que a etiqueta declarou ser de outra pessoa sai
  // da frente: o endereço do remetente e o de devolução são endereços válidos e
  // completos, e escolher um deles é o erro mais caro que este parser comete.
  const linhasNeutras = blocos
    .filter((b) => b.zona !== 'remetente' && b.zona !== 'devolucao')
    .flatMap((b) => b.linhas.map((l) => l.texto));

  const enderecoLido: EnderecoLido = extrairEndereco(destino ? linhasDoDestino : linhasNeutras);

  // Bloco / unidade / andar, em ordem de preferência: o que o campo
  // `Complemento` disser, depois o texto da zona de destino com as quebras
  // desfeitas, e só então a etiqueta inteira.
  const doComplemento = destinoDoComplemento(enderecoLido.complemento);
  const daZona: DestinoLido = destino
    ? extrairDestino(destino.bloco.textoCorrido, false)
    : { bloco: null, numero: null, andar: null };
  const global = extrairDestino(textoGlobal);

  const [bloco, origemBloco] = escolher(
    [doComplemento.bloco, 'zona'],
    [daZona.bloco, 'zona'],
    [global.bloco, 'global'],
  );
  const [numero, origemNumero] = escolher(
    [doComplemento.numero, 'zona'],
    [daZona.numero, 'zona'],
    [global.numero, 'global'],
  );
  const [andar, origemAndar] = escolher(
    [doComplemento.andar, 'zona'],
    [daZona.andar, 'zona'],
    [global.andar, 'global'],
  );

  const codigoRastreio = extrairRastreio(textoGlobal);
  const cep = destino
    ? (extrairCep(linhasDoDestino) ?? extrairCep(linhasNeutras))
    : extrairCep(linhasNeutras);

  const campos: CamposEtiqueta = {
    destinatario: destino ? destinatarioDaZona(destino, blocos) : destinatarioGlobal(todas),
    endereco: enderecoLido.endereco,
    complemento: enderecoLido.complemento,
    bloco,
    numero,
    andar,
    bairro: enderecoLido.bairro,
    cidade: enderecoLido.cidade,
    uf: enderecoLido.uf,
    codigoRastreio,
    // O nome escrito vale mais que o formato do código: uma etiqueta da Shopee
    // pode carregar um objeto postado nos Correios.
    transportadora: detectarPorTexto(textoGlobal) ?? detectarPorCodigo(codigoRastreio),
    cep,
  };

  // Um elo fraco derruba tudo (`min`), como no modelo de confiança do Poupe no
  // Mercado: nitidez do OCR naquele trecho E certeza de que o trecho é o certo.
  const confiancaBruta =
    preparo.linhas.reduce((s, l) => s + l.confianca, 0) / preparo.linhas.length;
  const daZonaOuGlobal = destino
    ? Math.min(destino.bloco.confianca, destino.bloco.certeza)
    : Math.min(confiancaBruta, TETO_GLOBAL);
  const notaGlobal = Math.min(confiancaBruta, TETO_GLOBAL);

  const confianca: Diagnostico['confianca'] = {};
  const registrar = (campo: keyof CamposEtiqueta, origem: Origem) => {
    if (campos[campo] === null) return;
    const nota = origem === 'zona' && destino ? daZonaOuGlobal : notaGlobal;
    confianca[campo] = Number(nota.toFixed(3));
  };

  const daZonaSeHouver: Origem = destino ? 'zona' : 'global';
  registrar('destinatario', daZonaSeHouver);
  registrar('endereco', daZonaSeHouver);
  registrar('complemento', daZonaSeHouver);
  registrar('bairro', daZonaSeHouver);
  registrar('cidade', daZonaSeHouver);
  registrar('uf', daZonaSeHouver);
  registrar('cep', daZonaSeHouver);
  registrar('bloco', origemBloco);
  registrar('numero', origemNumero);
  registrar('andar', origemAndar);

  // Rastreio e transportadora não dependem de zona: o formato do código e o
  // nome da marca são inequívocos onde quer que estejam impressos.
  if (campos.codigoRastreio) confianca.codigoRastreio = Number(confiancaBruta.toFixed(3));
  if (campos.transportadora) confianca.transportadora = Number(confiancaBruta.toFixed(3));

  const camposFracos = (Object.keys(confianca) as (keyof CamposEtiqueta)[]).filter(
    (campo) => (confianca[campo] ?? 0) < LIMIAR_FRACO,
  );

  return {
    campos,
    confianca,
    camposFracos,
    zonas: blocos.map((b) => ({
      zona: b.zona,
      certeza: b.certeza,
      motivo: b.motivo,
      linhas: b.linhas.length,
    })),
  };
}

/** Só os campos — é o que o banco de amostras e o placar consomem. */
export function extrairCampos(linhas: LinhaOcr[], opcoes: OpcoesParser = {}): CamposEtiqueta {
  return extrairComDiagnostico(linhas, opcoes).campos;
}

/**
 * Atalho para teste e para reprocessar amostra a partir de texto solto.
 *
 * Sem `box`, o parser perde a geometria e o agrupamento passa a depender só dos
 * rótulos de zona (ver `prepararLinhas`). É de propósito: o caso real sempre
 * tem posição, e este atalho existe para escrever caso de regressão à mão.
 */
export function extrairDeTexto(linhas: string[], opcoes: OpcoesParser = {}): CamposEtiqueta {
  return extrairCampos(
    linhas.map((texto) => ({
      texto,
      confianca: 1,
      box: [0, 0, 0, 0] as [number, number, number, number],
    })),
    opcoes,
  );
}
