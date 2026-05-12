import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Apartamento, Encomenda, EncomendaStatus, Morador, WhatsappMessage } from '../../database/entities';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export interface NotificacaoResumo {
  status: string;
  errorMessage: string | null;
  templateName: string | null;
  criadaEm: Date;
}
import { CancelarEncomendaDto } from './dto/cancelar-encomenda.dto';
import { CriarEncomendaDto } from './dto/criar-encomenda.dto';
import { ListarEncomendasQuery } from './dto/listar-encomendas.query';
import { RetirarEncomendaDto } from './dto/retirar-encomenda.dto';

const ATIVAS: EncomendaStatus[] = ['aguardando', 'notificado'];
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class EncomendasService {
  private readonly logger = new Logger(EncomendasService.name);

  constructor(
    @InjectRepository(Encomenda) private readonly repo: Repository<Encomenda>,
    @InjectRepository(Apartamento) private readonly aptoRepo: Repository<Apartamento>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    @InjectRepository(WhatsappMessage) private readonly waRepo: Repository<WhatsappMessage>,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Última notificação de chegada (encomenda_chegou) enviada por encomenda. */
  private async carregarNotificacoes(
    encomendaIds: string[],
  ): Promise<Map<string, NotificacaoResumo>> {
    const map = new Map<string, NotificacaoResumo>();
    if (encomendaIds.length === 0) return map;
    const msgs = await this.waRepo.find({
      where: { encomendaId: In(encomendaIds), direction: 'out', templateName: 'encomenda_chegou' },
      order: { createdAt: 'DESC' },
    });
    for (const m of msgs) {
      if (!m.encomendaId || map.has(m.encomendaId)) continue;
      map.set(m.encomendaId, {
        status: m.status,
        errorMessage: m.errorMessage,
        templateName: m.templateName,
        criadaEm: m.createdAt,
      });
    }
    return map;
  }

  private async anexarNotificacoes(items: Encomenda[]): Promise<void> {
    const map = await this.carregarNotificacoes(items.map((i) => i.id));
    for (const i of items) {
      (i as Encomenda & { notificacao: NotificacaoResumo | null }).notificacao =
        map.get(i.id) ?? null;
    }
  }

  async criar(tenantId: string, userId: string, dto: CriarEncomendaDto): Promise<Encomenda> {
    const apto = await this.aptoRepo.findOne({
      where: { id: dto.apartamentoId, tenantId, ativo: true },
    });
    if (!apto) throw new NotFoundException('Apartamento não encontrado neste condomínio');

    if (dto.moradorDestinoId) {
      const morador = await this.moradorRepo.findOne({
        where: { id: dto.moradorDestinoId, tenantId, apartamentoId: apto.id, ativo: true },
      });
      if (!morador) {
        throw new BadRequestException('Morador destinatário não pertence a este apartamento');
      }
    }

    const encomenda = await this.saveWithUniqueCodigo(tenantId, () =>
      this.repo.create({
        tenantId,
        apartamentoId: apto.id,
        moradorDestinoId: dto.moradorDestinoId ?? null,
        descricao: dto.descricao ?? null,
        transportadora: dto.transportadora ?? null,
        codigoRastreio: dto.codigoRastreio ?? null,
        fotoUrl: dto.fotoUrl ?? null,
        observacoes: dto.observacoes ?? null,
        codigoRetirada: this.gerarCodigoCandidate(),
        status: 'aguardando',
        recebidaPorUserId: userId,
      }),
    );

    await this.whatsapp.enqueueNotifyMorador({ encomendaId: encomenda.id, tenantId });

    return this.obter(tenantId, encomenda.id);
  }

  async retirar(
    tenantId: string,
    userId: string,
    id: string,
    dto: RetirarEncomendaDto,
  ): Promise<Encomenda> {
    if (!dto.codigoRetirada && !dto.documentoRetirada) {
      throw new BadRequestException('Informe código de retirada OU documento');
    }

    const encomenda = await this.repo.findOne({ where: { id, tenantId } });
    if (!encomenda) throw new NotFoundException('Encomenda não encontrada');
    if (!ATIVAS.includes(encomenda.status)) {
      throw new ConflictException(`Encomenda com status "${encomenda.status}" não pode ser retirada`);
    }

    if (dto.codigoRetirada && encomenda.codigoRetirada !== dto.codigoRetirada) {
      throw new BadRequestException('Código de retirada inválido');
    }

    if (dto.moradorRetiradaId) {
      const morador = await this.moradorRepo.findOne({
        where: { id: dto.moradorRetiradaId, tenantId, apartamentoId: encomenda.apartamentoId, ativo: true },
      });
      if (!morador) {
        throw new BadRequestException('Morador da retirada não pertence a este apartamento');
      }
    }

    encomenda.status = 'retirada';
    encomenda.retiradaAt = new Date();
    encomenda.retiradaPorUserId = userId;
    encomenda.retiradaPorMoradorId = dto.moradorRetiradaId ?? encomenda.moradorDestinoId;
    encomenda.retiradaDocumento = dto.documentoRetirada ?? null;
    encomenda.retiradaObservacoes = dto.observacoes ?? null;
    await this.repo.save(encomenda);

    await this.whatsapp.enqueueConfirmarRetirada({ encomendaId: encomenda.id, tenantId });

    return this.obter(tenantId, encomenda.id);
  }

  async cancelar(tenantId: string, id: string, dto: CancelarEncomendaDto): Promise<Encomenda> {
    const encomenda = await this.repo.findOne({ where: { id, tenantId } });
    if (!encomenda) throw new NotFoundException('Encomenda não encontrada');
    if (!ATIVAS.includes(encomenda.status)) {
      throw new ConflictException(`Encomenda com status "${encomenda.status}" não pode ser cancelada`);
    }
    encomenda.status = 'cancelada';
    encomenda.canceladaAt = new Date();
    encomenda.cancelamentoMotivo = dto.motivo;
    await this.repo.save(encomenda);
    return this.obter(tenantId, encomenda.id);
  }

  private baseQuery(tenantId: string, q: ListarEncomendasQuery) {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.apartamento', 'a')
      .leftJoinAndSelect('e.moradorDestino', 'm')
      .where('e.tenantId = :tenantId', { tenantId });

    if (q.status) qb.andWhere('e.status = :status', { status: q.status });
    if (q.apartamentoId) qb.andWhere('e.apartamentoId = :aptoId', { aptoId: q.apartamentoId });
    if (q.desde) qb.andWhere('e.createdAt >= :desde', { desde: q.desde });
    if (q.ate) qb.andWhere('e.createdAt <= :ate', { ate: q.ate });
    if (q.q && q.q.trim()) {
      qb.andWhere(
        '(e.descricao ILIKE :s OR e.transportadora ILIKE :s OR e.codigoRastreio ILIKE :s OR e.codigoRetirada = :code OR a.identificador ILIKE :s)',
        { s: `%${q.q.trim()}%`, code: q.q.trim() },
      );
    }
    return qb;
  }

  async listar(tenantId: string, q: ListarEncomendasQuery) {
    const qb = this.baseQuery(tenantId, q)
      .orderBy('e.createdAt', 'DESC')
      .take(q.limit)
      .skip((q.page - 1) * q.limit);
    const [items, total] = await qb.getManyAndCount();
    await this.anexarNotificacoes(items);
    return { items, total, page: q.page, limit: q.limit };
  }

  async exportarCsv(tenantId: string, q: ListarEncomendasQuery): Promise<string> {
    const items = await this.baseQuery(tenantId, q).orderBy('e.createdAt', 'DESC').take(5000).getMany();

    const headers = [
      'id', 'apartamento', 'descricao', 'transportadora', 'codigo_rastreio',
      'codigo_retirada', 'status', 'criada_em', 'notificada_em', 'retirada_em',
      'retirada_documento', 'cancelada_em', 'cancelamento_motivo',
    ];
    const escape = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(',')];
    for (const e of items) {
      lines.push(
        [
          e.id,
          e.apartamento?.identificador ?? '',
          e.descricao ?? '',
          e.transportadora ?? '',
          e.codigoRastreio ?? '',
          e.codigoRetirada,
          e.status,
          e.createdAt?.toISOString() ?? '',
          e.notificadaAt?.toISOString() ?? '',
          e.retiradaAt?.toISOString() ?? '',
          e.retiradaDocumento ?? '',
          e.canceladaAt?.toISOString() ?? '',
          e.cancelamentoMotivo ?? '',
        ].map(escape).join(','),
      );
    }
    return lines.join('\n');
  }

  async obter(tenantId: string, id: string): Promise<Encomenda> {
    const encomenda = await this.repo.findOne({
      where: { id, tenantId },
      relations: {
        apartamento: true,
        moradorDestino: true,
        recebidaPor: true,
        retiradaPorMorador: true,
        retiradaPorUser: true,
      },
    });
    if (!encomenda) throw new NotFoundException('Encomenda não encontrada');
    await this.anexarNotificacoes([encomenda]);
    return encomenda;
  }

  private gerarCodigoCandidate(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  private async saveWithUniqueCodigo(
    tenantId: string,
    factory: () => Encomenda,
  ): Promise<Encomenda> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const encomenda = factory();
      // Reuse the factory's other fields but reroll código a cada tentativa
      if (attempt > 0) encomenda.codigoRetirada = this.gerarCodigoCandidate();
      try {
        return await this.repo.save(encomenda);
      } catch (err) {
        if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
          this.logger.warn(`Colisão de código de retirada (tentativa ${attempt + 1})`);
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException('Não foi possível gerar código de retirada único — muitas encomendas ativas');
  }
}
