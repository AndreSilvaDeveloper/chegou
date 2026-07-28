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
   * Duas tentativas, nesta ordem: com o bloco que a etiqueta trouxe e sem ele.
   *
   * A segunda existe porque `buscarPorNumero` sem bloco exige `bloco IS NULL` —
   * então, num condomínio de bloco único, uma etiqueta que menciona "BL A" não
   * acharia nada se a gente insistisse no bloco lido.
   *
   * Não há terceira tentativa "procura o número em todos os blocos": em
   * condomínio de múltiplos blocos o mesmo número existe em vários, e escolher
   * um deles seria entregar a encomenda no bloco errado.
   */
  private async resolverApartamento(tenantId: string, campos: CamposEtiqueta) {
    const numero = campos.numero?.trim();
    if (!numero) return null;

    const bloco = campos.bloco?.trim();
    if (bloco) {
      const comBloco = await this.apartamentos.buscarPorNumero(tenantId, numero, bloco);
      if (comBloco) return comBloco;
    }
    return this.apartamentos.buscarPorNumero(tenantId, numero);
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

    const alvo = normalizar(nomeLido);
    const partes = (nome: string) => normalizar(nome).split(' ').filter(Boolean);
    const lido = partes(nomeLido);

    const exato = moradores.find((m) => normalizar(m.nome) === alvo);
    if (exato) return exato;

    if (lido.length < 2) return null;
    const primeiro = lido[0];
    const ultimo = lido[lido.length - 1];

    const candidatos = moradores.filter((m) => {
      const p = partes(m.nome);
      return p.length >= 2 && p[0] === primeiro && p[p.length - 1] === ultimo;
    });

    // Dois moradores com primeiro e último nome iguais: não dá para decidir.
    return candidatos.length === 1 ? candidatos[0] : null;
  }
}
