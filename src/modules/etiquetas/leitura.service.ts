import { Injectable, Logger } from '@nestjs/common';
import type { Apartamento, CamposEtiqueta } from '../../database/entities';
import { ApartamentosService } from '../apartamentos/apartamentos.service';
import { MoradoresService } from '../moradores/moradores.service';
import { extrairCampos } from './parser/etiqueta-parser';
import { normalizar } from './parser/texto';
import { OcrService } from './ocr.service';

export interface LeituraEtiqueta {
  campos: CamposEtiqueta;
  /**
   * Unidade do condomínio que casou com o que foi lido; `null` = porteiro
   * escolhe. Vai a entidade inteira porque é o que a tela já usa em todo o
   * fluxo (o mesmo formato de `/apartamentos/lookup`) — devolver um resumo
   * obrigaria a tela a fazer um segundo request só para completar.
   */
  apartamento: Apartamento | null;
  moradorId: string | null;
  moradorNome: string | null;
  /** Quantas linhas o OCR conseguiu ler — 0 explica um resultado vazio. */
  linhasLidas: number;
}

/**
 * Leitura da etiqueta na portaria: foto → OCR → parser → cadastro do condomínio.
 *
 * Tudo que sai daqui é **sugestão**. A tela sempre pede confirmação, porque
 * encomenda notificada para o morador errado é pior que encomenda digitada à
 * mão. Por isso nenhuma heurística aqui "chuta no empate": na dúvida devolve
 * `null` e deixa o porteiro escolher.
 */
@Injectable()
export class LeituraEtiquetaService {
  private readonly logger = new Logger(LeituraEtiquetaService.name);

  constructor(
    private readonly ocr: OcrService,
    private readonly apartamentos: ApartamentosService,
    private readonly moradores: MoradoresService,
  ) {}

  async ler(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<LeituraEtiqueta> {
    const { linhas } = await this.ocr.ler(file);
    const campos = extrairCampos(linhas);

    const apartamento = await this.resolverApartamento(tenantId, campos);
    const morador = apartamento
      ? await this.resolverMorador(tenantId, apartamento.id, campos.destinatario)
      : null;

    this.logger.log(
      `Etiqueta lida: ${linhas.length} linhas, unidade ${apartamento?.identificador ?? '—'}`,
    );

    return {
      campos,
      apartamento,
      moradorId: morador?.id ?? null,
      moradorNome: morador?.nome ?? null,
      linhasLidas: linhas.length,
    };
  }

  /**
   * Variações do número que significam a mesma unidade.
   *
   * O cadastro guarda o que o síndico digitou e a etiqueta traz o que o
   * remetente escreveu — `302`, `0302` e `302-B` são a mesma porta para o
   * morador, mas três strings diferentes para um `=` em SQL. Ordem importa: a
   * forma lida vem primeiro, e só depois as reescritas.
   */
  private variacoesDeNumero(numero: string): string[] {
    const base = numero.trim().toUpperCase();
    const semSeparador = base.replace(/[\s-]/g, '');
    const semZeros = semSeparador.replace(/^0+(?=\d)/, '');
    const soDigitos = semSeparador.replace(/[A-Z]+$/, '');
    const comHifen = semSeparador.replace(/^(\d+)([A-Z])$/, '$1-$2');

    return [...new Set([base, semSeparador, semZeros, comHifen, soDigitos])].filter(Boolean);
  }

  /**
   * Três tentativas, nesta ordem: com o bloco lido, sem bloco, e — só quando o
   * número é único no condomínio inteiro — em qualquer bloco.
   *
   * A segunda existe porque `buscarPorNumero` sem bloco exige `bloco IS NULL` —
   * então, num condomínio de bloco único, uma etiqueta que menciona "BL A" não
   * acharia nada se a gente insistisse no bloco lido.
   *
   * A terceira **não** é "escolher um bloco": ela só aceita quando existe uma
   * única unidade com aquele número no condomínio todo. A regra que vale aqui é
   * "nunca escolher entre vários", e não "nunca olhar fora do bloco" — desistir
   * quando não há ambiguidade nenhuma jogava fora o caso mais comum de todos, a
   * etiqueta cujo bloco não saiu legível na foto.
   */
  private async resolverApartamento(tenantId: string, campos: CamposEtiqueta) {
    const numero = campos.numero?.trim();
    if (!numero) return null;

    const variacoes = this.variacoesDeNumero(numero);
    const bloco = campos.bloco?.trim();

    if (bloco) {
      for (const v of variacoes) {
        const comBloco = await this.apartamentos.buscarPorNumero(tenantId, v, bloco);
        if (comBloco) return comBloco;
      }
    }

    for (const v of variacoes) {
      const semBloco = await this.apartamentos.buscarPorNumero(tenantId, v);
      if (semBloco) return semBloco;
    }

    for (const v of variacoes) {
      const todos = await this.apartamentos.listarPorNumero(tenantId, v);
      if (todos.length === 1) return todos[0];
      // Achou várias com este número: é ambíguo de verdade, e nenhuma variação
      // seguinte vai desambiguar. Parar aqui evita que uma reescrita mais frouxa
      // (`302-B` -> `302`) devolva por acidente algo que a forma lida rejeitou.
      if (todos.length > 1) return null;
    }

    return null;
  }

  /**
   * Casa o nome lido com um morador **daquela unidade**.
   *
   * Só aceita nome idêntico (normalizado) ou primeiro+último nome batendo.
   * Parecido não basta: "Ana Silva" e "Ana Souza" moram no mesmo prédio, e
   * escolher a errada manda a notificação para o celular errado.
   */
  private async resolverMorador(tenantId: string, apartamentoId: string, destinatario: string | null) {
    const nomeLido = destinatario?.trim();
    if (!nomeLido) return null;

    const moradores = await this.moradores.listar(tenantId, { apartamentoId });
    if (!moradores.length) return null;

    const lido = tokensDeNome(nomeLido);
    if (!lido.length) return null;

    const daLista = moradores.map((m) => ({ morador: m, tokens: tokensDeNome(m.nome) }));

    // 1. Nome idêntico depois de normalizar. `MARIA SOUZA.` e `MARIA DE SOUZA`
    //    chegam aqui como a mesma coisa — antes a pontuação e a preposição
    //    faziam a comparação falhar num nome que era obviamente o mesmo.
    const exato = daLista.filter((c) => c.tokens.join(' ') === lido.join(' '));
    if (exato.length === 1) return exato[0].morador;

    if (lido.length < 2) return null;

    // 2. Primeiro + último nome. É a regra antiga, e continua sendo a que mais
    //    casa: a etiqueta abrevia o meio, o cadastro não.
    const porPontas = daLista.filter(
      (c) =>
        c.tokens.length >= 2 &&
        c.tokens[0] === lido[0] &&
        c.tokens[c.tokens.length - 1] === lido[lido.length - 1],
    );
    if (porPontas.length === 1) return porPontas[0].morador;

    // 3. Todos os tokens lidos estão no cadastro. Cobre `JOSE CARLOS SILVA` para
    //    `JOSE CARLOS SILVA JUNIOR`, que a regra 2 rejeita porque a última
    //    palavra é o sufixo.
    const porContencao = daLista.filter((c) => lido.every((t) => c.tokens.includes(t)));
    if (porContencao.length === 1) return porContencao[0].morador;

    // 4. Truncamento à direita — o erro mais comum de etiqueta térmica cortada:
    //    `MARIA APARECIDA SOU` para `MARIA APARECIDA SOUZA`. Exige o mesmo
    //    começo, token a token, e pelo menos 3 letras no último pedaço, senão
    //    `MARIA A` casaria com meio condomínio.
    if (lido[lido.length - 1].length >= 3) {
      const porPrefixo = daLista.filter(
        (c) =>
          c.tokens.length >= lido.length &&
          lido.every((t, i) => c.tokens[i]?.startsWith(t)),
      );
      if (porPrefixo.length === 1) return porPrefixo[0].morador;
    }

    // Empate em qualquer regra: não dá para decidir, e o porteiro escolhe.
    return null;
  }
}

/** Preposições não distinguem ninguém e a etiqueta as omite metade das vezes. */
const PREPOSICOES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

/**
 * Nome em tokens comparáveis: sem acento, sem pontuação, sem preposição.
 *
 * A pontuação é o detalhe que mais atrapalhava: `normalizar()` não a remove, e
 * um ponto final que o OCR pegou (`MARIA SOUZA.`) bastava para o nome não casar
 * com o cadastro. Vale para os dois lados da comparação, sempre.
 */
function tokensDeNome(nome: string): string[] {
  return normalizar(nome)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(' ')
    .filter((p) => p.length > 1 && !PREPOSICOES.has(p));
}
