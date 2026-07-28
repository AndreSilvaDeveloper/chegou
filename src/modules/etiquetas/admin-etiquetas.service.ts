import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EtiquetaAmostra, type CamposEtiqueta } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { AtualizarAmostraDto, CamposEtiquetaDto } from './dto/campos-etiqueta.dto';
import { extrairCampos, PARSER_VERSAO } from './parser/etiqueta-parser';
import { montarPlacar, type Placar } from './placar';
import { OcrService } from './ocr.service';

/** Resumo para a listagem — sem as linhas do OCR, que são pesadas. */
export type AmostraResumo = Omit<EtiquetaAmostra, 'ocrLinhas' | 'tenant'> & {
  conferida: boolean;
};

@Injectable()
export class AdminEtiquetasService {
  private readonly logger = new Logger(AdminEtiquetasService.name);

  constructor(
    @InjectRepository(EtiquetaAmostra)
    private readonly repo: Repository<EtiquetaAmostra>,
    private readonly ocr: OcrService,
    private readonly storage: StorageService,
  ) {}

  async status() {
    const [total, conferidas] = await Promise.all([
      this.repo.count({ where: { ativo: true } }),
      this.repo
        .createQueryBuilder('a')
        .where('a.ativo = true AND a.gabarito IS NOT NULL')
        .getCount(),
    ]);
    return {
      ocrConfigurado: this.ocr.isConfigured,
      ocrDisponivel: await this.ocr.disponivel(),
      parserVersao: PARSER_VERSAO,
      amostras: total,
      conferidas,
    };
  }

  /**
   * Sobe uma foto, passa pelo OCR e já roda o parser.
   *
   * A saída crua do OCR fica gravada: é ela que permite reprocessar com um
   * parser novo sem reenviar a imagem (cada leitura custa segundos de CPU).
   */
  async criar(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    tenantId: string | null,
  ): Promise<EtiquetaAmostra> {
    const { url, key } = await this.storage.uploadEtiquetaAmostra(file);

    try {
      const resultado = await this.ocr.ler(file);
      const extraido = extrairCampos(resultado.linhas);

      return await this.repo.save(
        this.repo.create({
          tenantId,
          fotoUrl: url,
          fotoKey: key,
          ocrLinhas: resultado.linhas,
          ocrMs: resultado.ms,
          extraido,
          parserVersao: PARSER_VERSAO,
          // Palpite inicial só para agrupar; o superadmin corrige na conferência.
          transportadora: extraido.transportadora,
        }),
      );
    } catch (err) {
      // A foto já subiu — sem isto, cada falha de OCR deixaria lixo pago no bucket.
      await this.storage.remover(key);
      throw err;
    }
  }

  async listar(filtros: { transportadora?: string; status?: 'pendente' | 'conferida' }) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.ativo = true')
      .orderBy('a.created_at', 'DESC');

    if (filtros.transportadora) {
      qb.andWhere('a.transportadora = :t', { t: filtros.transportadora });
    }
    if (filtros.status === 'pendente') qb.andWhere('a.gabarito IS NULL');
    if (filtros.status === 'conferida') qb.andWhere('a.gabarito IS NOT NULL');

    // `ocr_linhas` fora da listagem: são dezenas de KB por amostra e a tela de
    // lista não usa nenhum deles.
    qb.select([
      'a.id', 'a.tenantId', 'a.fotoUrl', 'a.transportadora', 'a.ocrMs',
      'a.extraido', 'a.gabarito', 'a.parserVersao', 'a.observacao', 'a.createdAt',
    ]);

    const itens = await qb.getMany();
    return itens.map((a) => ({ ...a, conferida: !!a.gabarito }));
  }

  async buscar(id: string): Promise<EtiquetaAmostra> {
    const amostra = await this.repo.findOne({ where: { id, ativo: true } });
    if (!amostra) throw new NotFoundException('Amostra não encontrada');
    return amostra;
  }

  async atualizar(id: string, dto: AtualizarAmostraDto): Promise<EtiquetaAmostra> {
    const amostra = await this.buscar(id);

    if (dto.gabarito !== undefined) {
      amostra.gabarito = this.normalizarGabarito(dto.gabarito);
    }
    // `undefined` = campo não veio na request; `null` = pedido explícito de limpar.
    if (dto.transportadora !== undefined) {
      amostra.transportadora = dto.transportadora?.trim() || null;
    }
    if (dto.observacao !== undefined) {
      amostra.observacao = dto.observacao?.trim() || null;
    }

    return this.repo.save(amostra);
  }

  /**
   * Remoção lógica. A foto continua no bucket de propósito: amostra apagada por
   * engano é recuperável mudando um booleano, e o custo de guardar um JPEG é
   * menor que o de perder um caso de regressão.
   */
  async remover(id: string): Promise<{ ok: true }> {
    const amostra = await this.buscar(id);
    amostra.ativo = false;
    await this.repo.save(amostra);
    return { ok: true };
  }

  /**
   * Roda o parser atual em todas as amostras e devolve o placar.
   *
   * Não chama o OCR — usa as linhas já gravadas. É isso que torna barato
   * mexer numa regex e medir o efeito na hora.
   */
  async reprocessar(): Promise<Placar> {
    const amostras = await this.repo.find({ where: { ativo: true } });

    for (const amostra of amostras) {
      amostra.extraido = extrairCampos(amostra.ocrLinhas ?? []);
      amostra.parserVersao = PARSER_VERSAO;
    }

    if (amostras.length) {
      await this.repo.save(amostras, { chunk: 100 });
    }
    this.logger.log(`Reprocessadas ${amostras.length} amostras com o parser v${PARSER_VERSAO}`);

    return montarPlacar(amostras, PARSER_VERSAO);
  }

  /** Placar sem reprocessar — usa o que já está gravado em cada amostra. */
  async placar(): Promise<Placar> {
    const amostras = await this.repo.find({
      where: { ativo: true },
      select: { id: true, transportadora: true, extraido: true, gabarito: true },
    });
    return montarPlacar(amostras, PARSER_VERSAO);
  }

  /**
   * O DTO só materializa o que veio no corpo; o placar precisa das 7 chaves
   * sempre presentes, senão "campo ausente" e "campo vazio" viram a mesma
   * coisa e o acerto de "não tem bloco" some da conta.
   */
  private normalizarGabarito(dto: CamposEtiquetaDto): CamposEtiqueta {
    const limpar = (v: string | null | undefined) => v?.trim() || null;
    return {
      destinatario: limpar(dto.destinatario),
      bloco: limpar(dto.bloco),
      numero: limpar(dto.numero),
      andar: limpar(dto.andar),
      transportadora: limpar(dto.transportadora),
      codigoRastreio: limpar(dto.codigoRastreio),
      cep: limpar(dto.cep),
    };
  }
}
