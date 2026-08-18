import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Apartamento, Encomenda, EncomendaStatus, Morador, Tenant, WhatsappMessage } from '../../database/entities';
import { TipoNotificacao } from '../../database/entities/notificacao.entity';
import {
  chaveDoDia,
  inicioDoDia,
  inicioDoMes,
  mesAnterior,
  mesSeguinte,
  somarDias,
  ymdLocal,
} from '../../common/fuso-brasil';
import { NotificationService } from '../notificacoes/notification.service';
import {
  buildEncomendaVars,
  buildRetiradaVars,
  renderTemplate,
  sortearTemplateEncomenda,
  sortearTemplateRetirada,
} from '../notificacoes/message-template';

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
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly notifications: NotificationService,
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

  /**
   * Anexa o nome do destinatário a cada encomenda: o morador destino escolhido ou,
   * na ausência dele, o morador principal do apartamento (mesma regra da notificação).
   */
  private async anexarDestinatario(items: Encomenda[]): Promise<void> {
    const semDestino = items.filter((e) => !e.moradorDestino && e.apartamentoId);
    let principalPorApto = new Map<string, string>();
    if (semDestino.length > 0) {
      const aptoIds = [...new Set(semDestino.map((e) => e.apartamentoId))];
      const principais = await this.moradorRepo.find({
        where: { apartamentoId: In(aptoIds), principal: true, ativo: true },
      });
      principalPorApto = new Map(principais.map((m) => [m.apartamentoId, m.nome]));
    }
    for (const e of items) {
      (e as Encomenda & { destinatarioNome: string | null }).destinatarioNome =
        e.moradorDestino?.nome ?? principalPorApto.get(e.apartamentoId) ?? null;
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
        tipo: dto.tipo ?? null,
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

    await this.enfileirarNotificacaoEncomenda(tenantId, encomenda, apto);

    return this.obter(tenantId, encomenda.id);
  }

  /**
   * Cria a notificação de chegada de encomenda na fila unificada (envio via OpenWA,
   * com template personalizado do condomínio + código de retirada). Best-effort:
   * uma falha aqui não deve derrubar o registro da encomenda.
   */
  private async enfileirarNotificacaoEncomenda(
    tenantId: string,
    encomenda: Encomenda,
    apto: Apartamento,
  ): Promise<void> {
    try {
      const morador =
        (encomenda.moradorDestinoId
          ? await this.moradorRepo.findOne({
              where: { id: encomenda.moradorDestinoId, tenantId, ativo: true },
            })
          : null) ??
        (await this.moradorRepo.findOne({
          where: { tenantId, apartamentoId: apto.id, principal: true, ativo: true },
        }));

      if (!morador) {
        this.logger.warn(`Encomenda ${encomenda.id} sem morador destinatário identificável`);
        return;
      }
      if (!morador.telefoneE164) {
        this.logger.warn(`Morador ${morador.id} sem telefone — sem notificação`);
        return;
      }
      if (!morador.receberWhatsapp) {
        this.logger.log(`Morador ${morador.id} optou por não receber WhatsApp`);
        return;
      }

      const tenant = await this.tenantRepo.findOneOrFail({ where: { id: tenantId } });
      encomenda.apartamento = apto; // garante identificador na renderização
      const vars = buildEncomendaVars(encomenda, morador, tenant);
      // Uma das cinco versões, sorteada por envio — ver `message-template.ts`.
      // O `{{saudacao}}` sobrevive a esta renderização de propósito: quem o
      // resolve é o agendamento, que sabe a que horas a mensagem sai.
      const conteudo = renderTemplate(sortearTemplateEncomenda(), vars);

      await this.notifications.agendarNotificacao({
        tenantId,
        tipo: TipoNotificacao.ENCOMENDA,
        referenciaTipo: 'encomenda',
        referenciaId: encomenda.id,
        destinatarioTelefone: morador.telefoneE164,
        destinatarioNome: morador.nome,
        moradorId: morador.id,
        conteudo,
        variaveisJson: vars,
        prioridade: 5,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao enfileirar notificação da encomenda ${encomenda.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Avisa o morador de que a encomenda foi entregue.
   *
   * Vai pela mesma fila da notificação de chegada, então herda janela de
   * horário e ritmo anti-bloqueio. `referenciaTipo` é `encomenda_retirada` de
   * propósito: o efeito colateral do dispatcher só age em `encomenda`, e marcar
   * como "notificado" uma encomenda já retirada seria voltar o status.
   */
  private async enfileirarConfirmacaoRetirada(
    tenantId: string,
    encomenda: Encomenda,
  ): Promise<void> {
    try {
      const morador =
        (encomenda.retiradaPorMoradorId
          ? await this.moradorRepo.findOne({
              where: { id: encomenda.retiradaPorMoradorId, tenantId, ativo: true },
            })
          : null) ??
        (await this.moradorRepo.findOne({
          where: { tenantId, apartamentoId: encomenda.apartamentoId, principal: true, ativo: true },
        }));

      if (!morador?.telefoneE164 || !morador.receberWhatsapp) return;

      const [apartamento, tenant] = await Promise.all([
        this.aptoRepo.findOneOrFail({ where: { id: encomenda.apartamentoId, tenantId } }),
        this.tenantRepo.findOneOrFail({ where: { id: tenantId } }),
      ]);

      const vars = buildRetiradaVars(encomenda, morador, tenant, apartamento);
      const template = sortearTemplateRetirada();

      await this.notifications.agendarNotificacao({
        tenantId,
        tipo: TipoNotificacao.ENCOMENDA,
        referenciaTipo: 'encomenda_retirada',
        referenciaId: encomenda.id,
        destinatarioTelefone: morador.telefoneE164,
        destinatarioNome: morador.nome,
        moradorId: morador.id,
        conteudo: renderTemplate(template, vars),
        variaveisJson: vars,
        prioridade: 7,
      });
    } catch (err) {
      // Confirmação é cortesia: nunca pode derrubar a retirada, que já aconteceu.
      this.logger.error(
        `Falha ao enfileirar confirmação de retirada da encomenda ${encomenda.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
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

    await this.enfileirarConfirmacaoRetirada(tenantId, encomenda);

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
    await this.anexarDestinatario(items);
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

  async obterEstatisticas(tenantId: string, q: ListarEncomendasQuery) {
    const qb = this.baseQuery(tenantId, q);
    const encomendas = await qb.getMany();

    const total = encomendas.length;
    const porStatus = encomendas.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculando tempo médio de retirada (em horas) para as retiradas
    let tempoMedioHoras = 0;
    const retiradas = encomendas.filter((e) => e.status === 'retirada' && e.retiradaAt && e.createdAt);
    if (retiradas.length > 0) {
      const totalMilissegundos = retiradas.reduce((acc, curr) => {
        return acc + (curr.retiradaAt!.getTime() - curr.createdAt!.getTime());
      }, 0);
      tempoMedioHoras = totalMilissegundos / retiradas.length / (1000 * 60 * 60);
    }

    // Top apartamentos (agrupando via TS, para evitar group-by complexo no query builder com count)
    const porApartamento = encomendas.reduce((acc, curr) => {
      if (curr.apartamentoId) {
        acc[curr.apartamentoId] = (acc[curr.apartamentoId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // Converte e ordena para pegar os top 5 (ou 10)
    // Para simplificar, retorna apenas o ID do apartamento e o valor. 
    // Em um cenário real, precisaríamos do JOIN para trazer a string do apartamento.
    // Como getMany já fez leftJoinAndSelect('e.apartamento', 'a'), podemos pegar a info lá!
    const apartMap = new Map<string, string>();
    for (const e of encomendas) {
      if (e.apartamentoId && e.apartamento) {
        apartMap.set(e.apartamentoId, e.apartamento.identificador);
      }
    }

    const topApartamentos = Object.entries(porApartamento)
      .map(([id, count]) => ({ id, identificador: apartMap.get(id) || id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      porStatus,
      tempoMedioHoras,
      topApartamentos,
    };
  }

  // ---------------- Dashboard (métricas + séries de volume) ----------------

  private static readonly WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  private static readonly MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  /** Série de volume (recebidas/retiradas/pendentes) agrupada por dia ou mês, no fuso local. */
  private async serieVolume(
    tenantId: string,
    unit: 'day' | 'month',
    startBoundary: string,
    buckets: { key: string; label: string }[],
  ): Promise<{ label: string; recebidas: number; retiradas: number; pendentes: number }[]> {
    const recebidasRows: { bucket: string; recebidas: number; pendentes: number }[] = await this.repo.manager.query(
      `SELECT to_char(date_trunc($3, created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS bucket,
              COUNT(*)::int AS recebidas,
              COUNT(*) FILTER (WHERE status IN ('aguardando','notificado'))::int AS pendentes
         FROM encomendas
        WHERE tenant_id = $1 AND created_at >= $2
        GROUP BY 1`,
      [tenantId, startBoundary, unit],
    );
    const retiradasRows: { bucket: string; retiradas: number }[] = await this.repo.manager.query(
      `SELECT to_char(date_trunc($3, retirada_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS bucket,
              COUNT(*)::int AS retiradas
         FROM encomendas
        WHERE tenant_id = $1 AND status = 'retirada' AND retirada_at IS NOT NULL AND retirada_at >= $2
        GROUP BY 1`,
      [tenantId, startBoundary, unit],
    );
    const recMap = new Map(recebidasRows.map((r) => [r.bucket, r]));
    const retMap = new Map(retiradasRows.map((r) => [r.bucket, Number(r.retiradas)]));
    return buckets.map((b) => ({
      label: b.label,
      recebidas: Number(recMap.get(b.key)?.recebidas ?? 0),
      pendentes: Number(recMap.get(b.key)?.pendentes ?? 0),
      retiradas: retMap.get(b.key) ?? 0,
    }));
  }

  async dashboard(tenantId: string) {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const hoje = ymdLocal();
    const { y, m } = hoje;

    // Limites de mês (atual e anterior) e do dia de hoje.
    const mesIni = inicioDoMes(y, m);
    const prox = mesSeguinte(y, m);
    const mesFim = inicioDoMes(prox.y, prox.m);
    const ant = mesAnterior(y, m);
    const mesAntIni = inicioDoMes(ant.y, ant.m);

    const hojeIni = inicioDoDia(hoje);
    const hojeFim = inicioDoDia(somarDias(hoje, 1));

    const tempoDesde = inicioDoDia(somarDias(hoje, -30));

    const [cardsRow]: { total_mes: number; total_mes_anterior: number; aguardando: number; retirados_hoje: number }[] =
      await this.repo.manager.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::int AS total_mes,
           COUNT(*) FILTER (WHERE created_at >= $4 AND created_at < $2)::int AS total_mes_anterior,
           COUNT(*) FILTER (WHERE status IN ('aguardando','notificado'))::int AS aguardando,
           COUNT(*) FILTER (WHERE status = 'retirada' AND retirada_at >= $5 AND retirada_at < $6)::int AS retirados_hoje
         FROM encomendas WHERE tenant_id = $1`,
        [tenantId, mesIni, mesFim, mesAntIni, hojeIni, hojeFim],
      );

    const [tempoRow]: { horas: number | null }[] = await this.repo.manager.query(
      `SELECT EXTRACT(EPOCH FROM AVG(retirada_at - created_at)) / 3600 AS horas
         FROM encomendas
        WHERE tenant_id = $1 AND status = 'retirada' AND retirada_at IS NOT NULL AND retirada_at >= $2`,
      [tenantId, tempoDesde],
    );

    const totalMes = Number(cardsRow.total_mes);
    const totalMesAnterior = Number(cardsRow.total_mes_anterior);
    const variacao = totalMesAnterior > 0 ? Math.round(((totalMes - totalMesAnterior) / totalMesAnterior) * 100) : null;

    // Semana atual (segunda a domingo).
    const dow = new Date(Date.UTC(y, m - 1, hoje.d)).getUTCDay(); // 0=Dom
    const monday = somarDias(hoje, dow === 0 ? -6 : -(dow - 1));
    const weekBuckets: { key: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const day = somarDias(monday, i);
      const wd = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
      weekBuckets.push({ key: chaveDoDia(day), label: EncomendasService.WEEKDAYS[wd] });
    }
    const semana = await this.serieVolume(tenantId, 'day', inicioDoDia(monday), weekBuckets);

    // Últimos 4 meses (incluindo o atual).
    const monthBuckets: { key: string; label: string }[] = [];
    for (let i = 3; i >= 0; i--) {
      let mm = m - 1 - i;
      let yy = y;
      while (mm < 0) {
        mm += 12;
        yy -= 1;
      }
      monthBuckets.push({ key: `${yy}-${pad2(mm + 1)}-01`, label: EncomendasService.MONTHS[mm] });
    }
    const meses = await this.serieVolume(tenantId, 'month', `${monthBuckets[0].key} 00:00:00-03:00`, monthBuckets);

    return {
      cards: {
        totalMes,
        totalMesAnterior,
        variacao,
        aguardando: Number(cardsRow.aguardando),
        retiradosHoje: Number(cardsRow.retirados_hoje),
        tempoMedioHoras: tempoRow?.horas != null ? Number(tempoRow.horas) : null,
      },
      semana,
      meses,
    };
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
