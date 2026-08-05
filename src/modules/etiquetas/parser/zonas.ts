/**
 * Zonas da etiqueta: o que cada bloco de texto significa.
 *
 * Uma etiqueta de marketplace tem de dois a quatro endereços impressos — o do
 * destino, o do remetente, o de devolução e às vezes o do centro de distribuição
 * — e até três nomes de pessoa. Sobre o texto todo concatenado não existe regra
 * que escolha o certo: a primeira ocorrência vence, e a primeira costuma ser a
 * do remetente, que a etiqueta imprime no alto.
 *
 * É o mesmo problema que o parser de etiqueta de gôndola do Poupe no Mercado
 * resolve com perfil de layout: classificar a região ANTES de extrair, e buscar
 * o valor relativo a uma âncora em vez de varrer o documento inteiro.
 *
 * A zona também vira **confiança**: campo lido dentro de uma zona de destino
 * rotulada vale mais que o mesmo campo garimpado na etiqueta inteira, e quem
 * consome precisa saber a diferença.
 */
import {
  agruparBlocos,
  type Bloco,
  type Linha,
  type Preparo,
  SEPARADOR,
  confiancaMedia,
} from './geometria';
import {
  digitosDoCep,
  MARCA_DESTINATARIO,
  MARCA_DESTINO_FRACA,
  MARCA_DEVOLUCAO,
  MARCA_LOGISTICA,
  MARCA_REMETENTE,
  RE_CEP,
} from './padroes';
import { normalizar } from './texto';

export type Zona = 'destino' | 'remetente' | 'devolucao' | 'logistica' | 'indefinida';

export interface BlocoZonado extends Bloco {
  zona: Zona;
  /** 0..1 — quanto se pode confiar nesta classificação. Entra na confiança final. */
  certeza: number;
  /**
   * `true` quando a etiqueta **disse** que ali está o destinatário. A diferença
   * importa: com rótulo, não achar nome perto significa "não tem" e o parser
   * devolve `null`; sem rótulo, ele ainda pode olhar o bloco vizinho de cima.
   */
  rotulada: boolean;
  motivo: string;
}

/**
 * O que o condomínio sabe sobre si mesmo.
 *
 * É o sinal mais forte que existe nesta etiqueta e o parser não usava: o CEP do
 * prédio é conhecido, está cadastrado, e aparece impresso **só** no bloco de
 * destino. Os outros CEPs da etiqueta são do galpão do remetente e do centro de
 * devolução, sempre em outra cidade.
 */
export interface Condominio {
  cep?: string | null;
  endereco?: string | null;
}

const CERTEZA = {
  cepDoCondominio: 0.98,
  enderecoDoCondominio: 0.92,
  rotulo: 0.9,
  marcadorFraco: 0.72,
  logistica: 0.6,
  indefinida: 0.4,
} as const;

/** Todos os CEPs de um texto, só dígitos. */
function cepsDoTexto(texto: string): string[] {
  const re = new RegExp(RE_CEP.source, 'g');
  const achados: string[] = [];
  for (const m of texto.matchAll(re)) achados.push(`${m[1]}${m[2]}`);
  return achados;
}

/** Palavras que não identificam um logradouro e por isso não servem de prova. */
const TOKENS_VAZIOS = new Set([
  'RUA',
  'R',
  'AVENIDA',
  'AV',
  'AVN',
  'TRAVESSA',
  'TV',
  'ALAMEDA',
  'AL',
  'RODOVIA',
  'ROD',
  'ESTRADA',
  'ESTR',
  'PRACA',
  'PC',
  'LARGO',
  'VILA',
  'JARDIM',
  'CONDOMINIO',
  'EDIFICIO',
  'RESIDENCIAL',
  'DE',
  'DA',
  'DO',
  'DAS',
  'DOS',
  'E',
  'CEP',
  'BAIRRO',
  'CENTRO',
  'SAO',
  'SANTA',
  'SANTO',
  'DOM',
  'PADRE',
  'PROF',
  'DR',
]);

function tokensDeEndereco(endereco: string): string[] {
  return normalizar(endereco)
    .replace(/[^A-Z0-9]/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !TOKENS_VAZIOS.has(t));
}

/**
 * O bloco fala do endereço do condomínio?
 *
 * Exige **duas** palavras próprias do logradouro (ou a única que houver). Uma
 * só casaria "Barão" com meia cidade; e o número do prédio sozinho aparece em
 * qualquer código de triagem da etiqueta.
 */
function pareceEnderecoDoCondominio(texto: string, endereco: string | null | undefined): boolean {
  if (!endereco) return false;
  const esperados = tokensDeEndereco(endereco);
  if (esperados.length === 0) return false;

  const presentes = esperados.filter((t) => new RegExp(`\\b${t}\\b`).test(texto));
  return presentes.length >= Math.min(2, esperados.length);
}

function classificar(bloco: Bloco, condominio?: Condominio): BlocoZonado {
  const texto = bloco.texto;
  const zonado = (zona: Zona, certeza: number, motivo: string, rotulada = false): BlocoZonado => ({
    ...bloco,
    zona,
    certeza,
    rotulada,
    motivo,
  });

  // 1. O CEP do próprio condomínio. Nenhuma heurística chega perto disso: o
  //    bloco que traz o CEP do prédio é o bloco do destino, ponto final.
  const cepCondominio = digitosDoCep(condominio?.cep);
  if (cepCondominio.length === 8 && cepsDoTexto(texto).includes(cepCondominio)) {
    return zonado(
      'destino',
      CERTEZA.cepDoCondominio,
      'cep do condominio',
      MARCA_DESTINATARIO.test(texto),
    );
  }

  // 2. Devolução vem antes de destinatário porque o bloco reverso diz
  //    "encaminhar para" — fraseologia de entrega num endereço que não é o
  //    destino. Na etiqueta da Shopee ele vem completo, com CEP, logo abaixo.
  if (MARCA_DEVOLUCAO.test(texto))
    return zonado('devolucao', CERTEZA.rotulo, 'rotulo de devolucao');

  if (MARCA_DESTINATARIO.test(texto)) {
    return zonado('destino', CERTEZA.rotulo, 'rotulo de destinatario', true);
  }

  if (MARCA_REMETENTE.test(texto))
    return zonado('remetente', CERTEZA.rotulo, 'rotulo de remetente');

  // 3. Sem rótulo nenhum: o endereço cadastrado do condomínio ainda decide.
  if (pareceEnderecoDoCondominio(texto, condominio?.endereco)) {
    return zonado('destino', CERTEZA.enderecoDoCondominio, 'endereco do condominio');
  }

  // 4. O formato do Mercado Livre: `Endereço:`, `CEP:`, `Cidade de destino:`,
  //    `Complemento:` — e nenhum rótulo de destinatário em lugar nenhum.
  if (MARCA_DESTINO_FRACA.test(texto)) {
    return zonado('destino', CERTEZA.marcadorFraco, 'campos de endereco de destino');
  }

  if (MARCA_LOGISTICA.test(texto)) return zonado('logistica', CERTEZA.logistica, 'formulario');

  return zonado('indefinida', CERTEZA.indefinida, 'sem marcador');
}

/** Linhas preparadas → blocos classificados, na ordem de leitura. */
export function zonear(preparo: Preparo, condominio?: Condominio): BlocoZonado[] {
  const blocos = agruparBlocos(preparo.linhas, {
    comGeometria: preparo.comGeometria,
    // Rótulo começa bloco novo mesmo colado no anterior: `DESTINATÁRIO` numa
    // tarja preta encosta no nome de baixo e no bloco de cima ao mesmo tempo.
    iniciaBloco: (t) =>
      MARCA_DESTINATARIO.test(t) || MARCA_REMETENTE.test(t) || MARCA_DEVOLUCAO.test(t),
  });

  return blocos.map((b) => classificar(b, condominio));
}

/** Quanto a certeza cai quando mais de um bloco entrou na zona de destino. */
const PENALIDADE_DE_UNIAO = 0.8;

export interface Destino {
  bloco: BlocoZonado;
  /** Índices dos blocos originais que entraram — para achar o vizinho de cima. */
  indices: number[];
}

/**
 * A zona de destino, unindo blocos de destino **vizinhos e igualmente certos**.
 *
 * União só entre vizinhos porque o mesmo endereço de entrega às vezes cai em
 * dois blocos (`Endereço:` num, `Complemento:` no outro, com uma régua entre
 * eles). Unir destinos distantes seria juntar a entrega com um carimbo de
 * triagem que por acaso citou "bairro".
 *
 * E só entre igualmente certos porque o empate é o que caracteriza "o mesmo
 * bloco partido em dois". Quando um vizinho é *menos* certo — o caso clássico é
 * o CEP do condomínio marcar um bloco com 0,98 e o do remetente ficar em 0,72
 * por ter um `Endereço:` impresso — unir seria desfazer justamente a distinção
 * que acabou de ser feita, e o nome de quem enviou voltaria a disputar o campo
 * do destinatário.
 */
export function zonaDeDestino(blocos: BlocoZonado[]): Destino | null {
  let melhor = -1;
  blocos.forEach((b, i) => {
    if (b.zona !== 'destino') return;
    if (melhor < 0 || b.certeza > blocos[melhor].certeza) melhor = i;
  });
  if (melhor < 0) return null;

  const igual = (i: number) =>
    blocos[i].zona === 'destino' && blocos[i].certeza >= blocos[melhor].certeza;

  const indices = [melhor];
  for (let i = melhor - 1; i >= 0 && igual(i); i--) indices.unshift(i);
  for (let i = melhor + 1; i < blocos.length && igual(i); i++) indices.push(i);

  const linhas: Linha[] = indices.flatMap((i) => blocos[i].linhas);
  const textos = linhas.map((l) => l.texto);

  return {
    bloco: {
      linhas,
      texto: textos.join(SEPARADOR),
      textoCorrido: textos.join(' '),
      caixa: blocos[melhor].caixa,
      confianca: confiancaMedia(linhas),
      zona: 'destino',
      // Precisou unir? Então mais de um bloco disputou o destino, e a resposta é
      // menos certa do que qualquer um deles isolado sugeria. É essa queda que
      // faz os campos saírem marcados como fracos em vez de saírem como fato.
      certeza: blocos[melhor].certeza * (indices.length > 1 ? PENALIDADE_DE_UNIAO : 1),
      rotulada: indices.some((i) => blocos[i].rotulada),
      motivo: blocos[melhor].motivo,
    },
    indices,
  };
}
