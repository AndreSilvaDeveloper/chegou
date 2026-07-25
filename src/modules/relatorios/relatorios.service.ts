import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Encomenda } from '../../database/entities';
import { RelatorioQuery } from './dto/relatorio.query';

/**
 * Agregações dos relatórios (/relatorios). Tudo em SQL puro para não trazer linha
 * a linha para o Node — o volume de encomendas de um condomínio cresce rápido.
 *
 * Convenção de fuso: igual à do dashboard — datas locais em America/Sao_Paulo
 * (offset fixo -03:00; o Brasil não tem horário de verão desde 2019).
 */

const TZ = 'America/Sao_Paulo';
const OFFSET = '-03:00';
const PENDENTES = "('aguardando','notificado')";

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const STATUS_LABEL: Record<string, string> = {
  aguardando: 'Aguardando',
  notificado: 'Notificado',
  retirada: 'Retirada',
  cancelada: 'Cancelada',
  devolvida: 'Devolvida',
};

/** Faixas de tempo até a retirada (horas) e de tempo parado na portaria. */
const FAIXAS_RETIRADA = [
  { key: 'ate2h', label: 'Até 2h' },
  { key: '2a6h', label: '2h a 6h' },
  { key: '6a24h', label: '6h a 24h' },
  { key: '1a3d', label: '1 a 3 dias' },
  { key: 'mais3d', label: 'Mais de 3 dias' },
];
const FAIXAS_AGING = [
  { key: 'ate24h', label: 'Até 24h' },
  { key: '1a3d', label: '1 a 3 dias' },
  { key: '3a7d', label: '3 a 7 dias' },
  { key: 'mais7d', label: 'Mais de 7 dias' },
];

interface Bucket {
  key: string;
  label: string;
}

export interface Periodo {
  desde: string;
  ate: string;
  dias: number;
  granularidade: 'dia' | 'semana' | 'mes';
  ini: string;
  fim: string;
  anteriorIni: string;
  anteriorFim: string;
  anteriorDesde: string;
  anteriorAte: string;
  unit: 'day' | 'week' | 'month';
  buckets: Bucket[];
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

@Injectable()
export class RelatoriosService {
  constructor(@InjectRepository(Encomenda) private readonly repo: Repository<Encomenda>) {}

  private query<T = Row>(sql: string, params: unknown[]): Promise<T[]> {
    return this.repo.manager.query(sql, params) as Promise<T[]>;
  }

  // ------------------------------------------------------------------ período

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Data de hoje (YYYY-MM-DD) no fuso do condomínio. */
  private hojeLocal(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private toUtc(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private toYmd(dt: Date): string {
    return `${dt.getUTCFullYear()}-${this.pad(dt.getUTCMonth() + 1)}-${this.pad(dt.getUTCDate())}`;
  }

  private addDias(ymd: string, delta: number): string {
    const dt = this.toUtc(ymd);
    dt.setUTCDate(dt.getUTCDate() + delta);
    return this.toYmd(dt);
  }

  /** Início do dia local como timestamptz aceito pelo Postgres. */
  private boundary(ymd: string): string {
    return `${ymd} 00:00:00${OFFSET}`;
  }

  private rotuloDia(ymd: string): string {
    const dt = this.toUtc(ymd);
    return `${this.pad(dt.getUTCDate())}/${this.pad(dt.getUTCMonth() + 1)}`;
  }

  private rotuloMes(ymd: string): string {
    const dt = this.toUtc(ymd);
    return `${MESES[dt.getUTCMonth()]}/${String(dt.getUTCFullYear()).slice(2)}`;
  }

  /** Resolve intervalo, granularidade, buckets do eixo X e o período anterior comparável. */
  resolverPeriodo(q: RelatorioQuery): Periodo {
    const hoje = this.hojeLocal();
    let ate = (q.ate ?? hoje).slice(0, 10);
    let desde = (q.desde ?? this.addDias(ate, -29)).slice(0, 10);
    if (desde > ate) [desde, ate] = [ate, desde];

    const dias =
      Math.round((this.toUtc(ate).getTime() - this.toUtc(desde).getTime()) / 86_400_000) + 1;

    const unit: Periodo['unit'] = dias <= 31 ? 'day' : dias <= 182 ? 'week' : 'month';
    const granularidade = unit === 'day' ? 'dia' : unit === 'week' ? 'semana' : 'mes';

    const buckets: Bucket[] = [];
    if (unit === 'day') {
      for (let cur = desde; cur <= ate; cur = this.addDias(cur, 1)) {
        buckets.push({ key: cur, label: this.rotuloDia(cur) });
      }
    } else if (unit === 'week') {
      // date_trunc('week') no Postgres começa na segunda-feira.
      const dow = this.toUtc(desde).getUTCDay();
      let cur = this.addDias(desde, dow === 0 ? -6 : -(dow - 1));
      while (cur <= ate) {
        buckets.push({ key: cur, label: this.rotuloDia(cur) });
        cur = this.addDias(cur, 7);
      }
    } else {
      const fimMes = `${ate.slice(0, 7)}-01`;
      let cur = `${desde.slice(0, 7)}-01`;
      while (cur <= fimMes) {
        buckets.push({ key: cur, label: this.rotuloMes(cur) });
        const dt = this.toUtc(cur);
        dt.setUTCMonth(dt.getUTCMonth() + 1);
        cur = this.toYmd(dt);
      }
    }

    const anteriorAte = this.addDias(desde, -1);
    const anteriorDesde = this.addDias(anteriorAte, -(dias - 1));

    return {
      desde,
      ate,
      dias,
      granularidade,
      unit,
      buckets,
      ini: this.boundary(desde),
      fim: this.boundary(this.addDias(ate, 1)),
      anteriorDesde,
      anteriorAte,
      anteriorIni: this.boundary(anteriorDesde),
      anteriorFim: this.boundary(this.addDias(anteriorAte, 1)),
    };
  }

  private variacao(atual: number, anterior: number): number | null {
    if (!anterior) return null;
    return Math.round(((atual - anterior) / anterior) * 100);
  }

  /** Distribui contagens em faixas fixas, garantindo faixa zerada no resultado. */
  private faixas(defs: { key: string; label: string }[], rows: Row[]) {
    const mapa = new Map(rows.map((r) => [String(r.faixa), num(r.total)]));
    return defs.map((f) => ({ key: f.key, label: f.label, total: mapa.get(f.key) ?? 0 }));
  }

  // -------------------------------------------------------------- encomendas

  private async resumoEncomendas(tenantId: string, ini: string, fim: string, bloco: string | null) {
    const [row] = await this.query(
      `SELECT COUNT(*)::int                                                      AS recebidas,
              COUNT(*) FILTER (WHERE e.status = 'aguardando')::int               AS aguardando,
              COUNT(*) FILTER (WHERE e.status = 'notificado')::int               AS notificado,
              COUNT(*) FILTER (WHERE e.status = 'retirada')::int                 AS retirada,
              COUNT(*) FILTER (WHERE e.status = 'cancelada')::int                AS cancelada,
              COUNT(*) FILTER (WHERE e.status = 'devolvida')::int                AS devolvida,
              COUNT(*) FILTER (WHERE e.notificada_at IS NOT NULL)::int           AS notificadas,
              COUNT(*) FILTER (WHERE e.foto_url IS NOT NULL)::int                AS com_foto,
              AVG(EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600)     AS tempo_medio,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600)  AS tempo_mediana,
              percentile_cont(0.9) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600)  AS tempo_p90,
              AVG(EXTRACT(EPOCH FROM (e.notificada_at - e.created_at)) / 60)     AS minutos_notificar
         FROM encomendas e
         JOIN apartamentos a ON a.id = e.apartamento_id
        WHERE e.tenant_id = $1
          AND e.created_at >= $2 AND e.created_at < $3
          AND ($4::text IS NULL OR a.bloco = $4)`,
      [tenantId, ini, fim, bloco],
    );

    const recebidas = num(row?.recebidas);
    const retiradas = num(row?.retirada);
    return {
      recebidas,
      retiradas,
      pendentes: num(row?.aguardando) + num(row?.notificado),
      canceladas: num(row?.cancelada),
      devolvidas: num(row?.devolvida),
      notificadas: num(row?.notificadas),
      comFoto: num(row?.com_foto),
      taxaRetirada: recebidas ? Math.round((retiradas / recebidas) * 100) : 0,
      taxaNotificacao: recebidas ? Math.round((num(row?.notificadas) / recebidas) * 100) : 0,
      tempoMedioHoras: numOrNull(row?.tempo_medio),
      tempoMedianoHoras: numOrNull(row?.tempo_mediana),
      tempoP90Horas: numOrNull(row?.tempo_p90),
      minutosAteNotificar: numOrNull(row?.minutos_notificar),
      porStatus: [
        { status: 'aguardando', label: STATUS_LABEL.aguardando, total: num(row?.aguardando) },
        { status: 'notificado', label: STATUS_LABEL.notificado, total: num(row?.notificado) },
        { status: 'retirada', label: STATUS_LABEL.retirada, total: retiradas },
        { status: 'cancelada', label: STATUS_LABEL.cancelada, total: num(row?.cancelada) },
        { status: 'devolvida', label: STATUS_LABEL.devolvida, total: num(row?.devolvida) },
      ],
    };
  }

  async encomendas(tenantId: string, q: RelatorioQuery) {
    const p = this.resolverPeriodo(q);
    const bloco = q.bloco?.trim() || null;
    const base = [tenantId, p.ini, p.fim, bloco];

    const [resumo, anterior] = await Promise.all([
      this.resumoEncomendas(tenantId, p.ini, p.fim, bloco),
      this.resumoEncomendas(tenantId, p.anteriorIni, p.anteriorFim, bloco),
    ]);

    const [
      serieRecebidas,
      serieRetiradas,
      faixasRetirada,
      faixasAging,
      pendentesAntigas,
      porHora,
      porDiaSemana,
      topApartamentos,
      porBloco,
      transportadoras,
      porTipo,
      operadores,
      blocosRows,
    ] = await Promise.all([
      // volume recebido por bucket
      this.query(
        `SELECT to_char(date_trunc($5, e.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS bucket,
                COUNT(*)::int                                            AS recebidas,
                COUNT(*) FILTER (WHERE e.status IN ${PENDENTES})::int     AS pendentes,
                COUNT(*) FILTER (WHERE e.status = 'cancelada')::int       AS canceladas
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1`,
        [...base, p.unit],
      ),
      // volume retirado por bucket (data da retirada, não do recebimento)
      this.query(
        `SELECT to_char(date_trunc($5, e.retirada_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS bucket,
                COUNT(*)::int AS retiradas
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.status = 'retirada'
            AND e.retirada_at >= $2 AND e.retirada_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1`,
        [...base, p.unit],
      ),
      // distribuição do tempo até a retirada
      this.query(
        `SELECT CASE WHEN h < 2 THEN 'ate2h'
                     WHEN h < 6 THEN '2a6h'
                     WHEN h < 24 THEN '6a24h'
                     WHEN h < 72 THEN '1a3d'
                     ELSE 'mais3d' END AS faixa,
                COUNT(*)::int AS total
           FROM (SELECT EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600 AS h
                   FROM encomendas e
                   JOIN apartamentos a ON a.id = e.apartamento_id
                  WHERE e.tenant_id = $1 AND e.status = 'retirada' AND e.retirada_at IS NOT NULL
                    AND e.created_at >= $2 AND e.created_at < $3
                    AND ($4::text IS NULL OR a.bloco = $4)) t
          GROUP BY 1`,
        base,
      ),
      // aging do estoque atual da portaria (snapshot — independe do período)
      this.query(
        `SELECT CASE WHEN h < 24 THEN 'ate24h'
                     WHEN h < 72 THEN '1a3d'
                     WHEN h < 168 THEN '3a7d'
                     ELSE 'mais7d' END AS faixa,
                COUNT(*)::int AS total
           FROM (SELECT EXTRACT(EPOCH FROM (now() - e.created_at)) / 3600 AS h
                   FROM encomendas e
                   JOIN apartamentos a ON a.id = e.apartamento_id
                  WHERE e.tenant_id = $1 AND e.status IN ${PENDENTES}
                    AND ($2::text IS NULL OR a.bloco = $2)) t
          GROUP BY 1`,
        [tenantId, bloco],
      ),
      // pendentes mais antigas — a fila que o síndico precisa cobrar
      this.query(
        `SELECT e.id,
                a.identificador,
                e.status,
                e.created_at,
                e.descricao,
                e.transportadora,
                COALESCE(md.nome, mp.nome) AS destinatario,
                (EXTRACT(EPOCH FROM (now() - e.created_at)) / 3600)::float AS horas
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
           LEFT JOIN moradores md ON md.id = e.morador_destino_id
           LEFT JOIN LATERAL (
                SELECT m.nome FROM moradores m
                 WHERE m.apartamento_id = e.apartamento_id AND m.principal AND m.ativo
                 LIMIT 1) mp ON true
          WHERE e.tenant_id = $1 AND e.status IN ${PENDENTES}
            AND ($2::text IS NULL OR a.bloco = $2)
          ORDER BY e.created_at ASC
          LIMIT 10`,
        [tenantId, bloco],
      ),
      // pico por hora do dia (recebimento)
      this.query(
        `SELECT EXTRACT(HOUR FROM e.created_at AT TIME ZONE '${TZ}')::int AS hora,
                COUNT(*)::int                                             AS recebidas
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1`,
        base,
      ),
      // pico por dia da semana
      this.query(
        `SELECT EXTRACT(DOW FROM e.created_at AT TIME ZONE '${TZ}')::int AS dow,
                COUNT(*)::int                                            AS recebidas
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1`,
        base,
      ),
      // ranking de apartamentos
      this.query(
        `SELECT a.id, a.identificador, a.bloco,
                COUNT(*)::int                                        AS total,
                COUNT(*) FILTER (WHERE e.status IN ${PENDENTES})::int AS pendentes,
                AVG(EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600) AS tempo_medio
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY a.id, a.identificador, a.bloco
          ORDER BY total DESC, a.identificador
          LIMIT 10`,
        base,
      ),
      // volume por bloco
      this.query(
        `SELECT COALESCE(NULLIF(TRIM(a.bloco), ''), 'Sem bloco') AS bloco,
                COUNT(*)::int                                     AS total,
                COUNT(DISTINCT a.id)::int                         AS apartamentos
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1
          ORDER BY total DESC
          LIMIT 12`,
        base,
      ),
      // ranking de transportadoras
      this.query(
        `SELECT COALESCE(NULLIF(TRIM(e.transportadora), ''), 'Não informada') AS nome,
                COUNT(*)::int                                                  AS total,
                AVG(EXTRACT(EPOCH FROM (e.retirada_at - e.created_at)) / 3600) AS tempo_medio
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1
          ORDER BY total DESC
          LIMIT 8`,
        base,
      ),
      // tipo de volume
      this.query(
        `SELECT COALESCE(e.tipo, 'nao_informado') AS tipo, COUNT(*)::int AS total
           FROM encomendas e
           JOIN apartamentos a ON a.id = e.apartamento_id
          WHERE e.tenant_id = $1 AND e.created_at >= $2 AND e.created_at < $3
            AND ($4::text IS NULL OR a.bloco = $4)
          GROUP BY 1
          ORDER BY total DESC`,
        base,
      ),
      // produtividade da portaria
      this.query(
        `SELECT u.id, u.nome, u.role,
                (SELECT COUNT(*) FROM encomendas e
                   JOIN apartamentos a ON a.id = e.apartamento_id
                  WHERE e.recebida_por_user_id = u.id
                    AND e.created_at >= $2 AND e.created_at < $3
                    AND ($4::text IS NULL OR a.bloco = $4))::int AS recebidas,
                (SELECT COUNT(*) FROM encomendas e
                   JOIN apartamentos a ON a.id = e.apartamento_id
                  WHERE e.retirada_por_user_id = u.id
                    AND e.retirada_at >= $2 AND e.retirada_at < $3
                    AND ($4::text IS NULL OR a.bloco = $4))::int AS retiradas
           FROM users u
          WHERE u.tenant_id = $1
          ORDER BY recebidas DESC, retiradas DESC`,
        base,
      ),
      // blocos disponíveis para o filtro (independe do período/filtro atual)
      this.query(
        `SELECT DISTINCT TRIM(a.bloco) AS bloco
           FROM apartamentos a
          WHERE a.tenant_id = $1 AND a.ativo AND NULLIF(TRIM(a.bloco), '') IS NOT NULL
          ORDER BY 1`,
        [tenantId],
      ),
    ]);

    const recMap = new Map(serieRecebidas.map((r) => [String(r.bucket), r]));
    const retMap = new Map(serieRetiradas.map((r) => [String(r.bucket), num(r.retiradas)]));
    const serie = p.buckets.map((b) => ({
      label: b.label,
      data: b.key,
      recebidas: num(recMap.get(b.key)?.recebidas),
      retiradas: retMap.get(b.key) ?? 0,
      pendentes: num(recMap.get(b.key)?.pendentes),
      canceladas: num(recMap.get(b.key)?.canceladas),
    }));

    const horaMap = new Map(porHora.map((r) => [num(r.hora), num(r.recebidas)]));
    const horas = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      label: `${this.pad(h)}h`,
      recebidas: horaMap.get(h) ?? 0,
    }));

    const dowMap = new Map(porDiaSemana.map((r) => [num(r.dow), num(r.recebidas)]));
    // Semana começando na segunda — como o síndico monta a escala.
    const semana = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      dia: d,
      label: WEEKDAYS_CURTO[d],
      nome: WEEKDAYS[d],
      recebidas: dowMap.get(d) ?? 0,
    }));

    const totalPendentes = faixasAging.reduce((acc, r) => acc + num(r.total), 0);

    return {
      periodo: {
        desde: p.desde,
        ate: p.ate,
        dias: p.dias,
        granularidade: p.granularidade,
        anteriorDesde: p.anteriorDesde,
        anteriorAte: p.anteriorAte,
        bloco,
      },
      blocos: blocosRows.map((r) => String(r.bloco)),
      resumo: {
        ...resumo,
        anterior: {
          recebidas: anterior.recebidas,
          retiradas: anterior.retiradas,
          canceladas: anterior.canceladas,
          taxaRetirada: anterior.taxaRetirada,
          tempoMedioHoras: anterior.tempoMedioHoras,
        },
        variacao: {
          recebidas: this.variacao(resumo.recebidas, anterior.recebidas),
          retiradas: this.variacao(resumo.retiradas, anterior.retiradas),
          taxaRetirada: this.variacao(resumo.taxaRetirada, anterior.taxaRetirada),
          tempoMedio:
            resumo.tempoMedioHoras != null && anterior.tempoMedioHoras
              ? this.variacao(resumo.tempoMedioHoras, anterior.tempoMedioHoras)
              : null,
        },
        estoqueAtual: totalPendentes,
      },
      serie,
      tempoRetirada: this.faixas(FAIXAS_RETIRADA, faixasRetirada),
      aging: this.faixas(FAIXAS_AGING, faixasAging),
      pendentesAntigas: pendentesAntigas.map((r) => ({
        id: String(r.id),
        identificador: String(r.identificador),
        status: String(r.status),
        destinatario: (r.destinatario as string | null) ?? null,
        descricao: (r.descricao as string | null) ?? null,
        transportadora: (r.transportadora as string | null) ?? null,
        criadaEm: r.created_at as Date,
        horas: num(r.horas),
      })),
      porHora: horas,
      porDiaSemana: semana,
      topApartamentos: topApartamentos.map((r) => ({
        id: String(r.id),
        identificador: String(r.identificador),
        bloco: (r.bloco as string | null) ?? null,
        total: num(r.total),
        pendentes: num(r.pendentes),
        tempoMedioHoras: numOrNull(r.tempo_medio),
      })),
      porBloco: porBloco.map((r) => ({
        bloco: String(r.bloco),
        total: num(r.total),
        apartamentos: num(r.apartamentos),
      })),
      transportadoras: transportadoras.map((r) => ({
        nome: String(r.nome),
        total: num(r.total),
        tempoMedioHoras: numOrNull(r.tempo_medio),
      })),
      porTipo: porTipo.map((r) => {
        const tipo = String(r.tipo);
        return {
          tipo,
          label: tipo === 'caixa' ? 'Caixa' : tipo === 'envelope' ? 'Envelope' : 'Não informado',
          total: num(r.total),
        };
      }),
      operadores: operadores
        .map((r) => ({
          id: String(r.id),
          nome: String(r.nome),
          role: String(r.role),
          recebidas: num(r.recebidas),
          retiradas: num(r.retiradas),
        }))
        .filter((o) => o.recebidas > 0 || o.retiradas > 0),
    };
  }

  // ---------------------------------------------------------------- whatsapp

  async whatsapp(tenantId: string, q: RelatorioQuery) {
    const p = this.resolverPeriodo(q);
    const base = [tenantId, p.ini, p.fim];

    const [[resumoRow], serieRows, porTipoRows, errosRows, porHoraRows, [alcanceRow], [semPrincipalRow]] =
      await Promise.all([
        this.query(
          `SELECT COUNT(*)::int                                                        AS total,
                  COUNT(*) FILTER (WHERE status = 'enviada')::int                      AS enviadas,
                  COUNT(*) FILTER (WHERE status = 'falha')::int                        AS falhas,
                  COUNT(*) FILTER (WHERE status IN ('pendente','enviando'))::int       AS na_fila,
                  COUNT(*) FILTER (WHERE status = 'agendada')::int                     AS agendadas,
                  COUNT(*) FILTER (WHERE status = 'cancelada')::int                    AS canceladas,
                  AVG(EXTRACT(EPOCH FROM (enviada_at - created_at)) / 60)
                      FILTER (WHERE status = 'enviada')                                AS minutos_fila,
                  AVG(tentativas::numeric) FILTER (WHERE status = 'enviada')           AS tentativas_media
             FROM notificacoes
            WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
          base,
        ),
        this.query(
          `SELECT to_char(date_trunc($4, created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS bucket,
                  COUNT(*) FILTER (WHERE status = 'enviada')::int                        AS enviadas,
                  COUNT(*) FILTER (WHERE status = 'falha')::int                          AS falhas,
                  COUNT(*) FILTER (WHERE status IN ('pendente','enviando','agendada'))::int AS na_fila
             FROM notificacoes
            WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
            GROUP BY 1`,
          [...base, p.unit],
        ),
        this.query(
          `SELECT tipo,
                  COUNT(*)::int                                   AS total,
                  COUNT(*) FILTER (WHERE status = 'enviada')::int  AS enviadas,
                  COUNT(*) FILTER (WHERE status = 'falha')::int    AS falhas
             FROM notificacoes
            WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
            GROUP BY 1
            ORDER BY total DESC`,
          base,
        ),
        this.query(
          `SELECT left(COALESCE(NULLIF(TRIM(erro_mensagem), ''), 'Erro não informado'), 140) AS erro,
                  COUNT(*)::int AS total
             FROM notificacoes
            WHERE tenant_id = $1 AND status = 'falha'
              AND created_at >= $2 AND created_at < $3
            GROUP BY 1
            ORDER BY total DESC
            LIMIT 6`,
          base,
        ),
        this.query(
          `SELECT EXTRACT(HOUR FROM enviada_at AT TIME ZONE '${TZ}')::int AS hora,
                  COUNT(*)::int                                           AS enviadas
             FROM notificacoes
            WHERE tenant_id = $1 AND status = 'enviada' AND enviada_at IS NOT NULL
              AND enviada_at >= $2 AND enviada_at < $3
            GROUP BY 1`,
          base,
        ),
        this.query(
          `SELECT COUNT(*)::int                                                             AS total,
                  COUNT(*) FILTER (WHERE telefone_e164 IS NULL OR TRIM(telefone_e164) = '')::int AS sem_telefone,
                  COUNT(*) FILTER (WHERE receber_whatsapp = false)::int                     AS opt_out,
                  COUNT(*) FILTER (WHERE telefone_e164 IS NOT NULL AND TRIM(telefone_e164) <> ''
                                     AND receber_whatsapp)::int                             AS alcancaveis
             FROM moradores
            WHERE tenant_id = $1 AND ativo`,
          [tenantId],
        ),
        this.query(
          `SELECT COUNT(*)::int AS total
             FROM apartamentos a
            WHERE a.tenant_id = $1 AND a.ativo
              AND NOT EXISTS (SELECT 1 FROM moradores m
                               WHERE m.apartamento_id = a.id AND m.ativo AND m.principal)`,
          [tenantId],
        ),
      ]);

    const enviadas = num(resumoRow?.enviadas);
    const falhas = num(resumoRow?.falhas);
    const concluidas = enviadas + falhas;

    const serieMap = new Map(serieRows.map((r) => [String(r.bucket), r]));
    const serie = p.buckets.map((b) => ({
      label: b.label,
      data: b.key,
      enviadas: num(serieMap.get(b.key)?.enviadas),
      falhas: num(serieMap.get(b.key)?.falhas),
      naFila: num(serieMap.get(b.key)?.na_fila),
    }));

    const horaMap = new Map(porHoraRows.map((r) => [num(r.hora), num(r.enviadas)]));
    const porHora = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      label: `${this.pad(h)}h`,
      enviadas: horaMap.get(h) ?? 0,
    }));

    const totalMoradores = num(alcanceRow?.total);
    const alcancaveis = num(alcanceRow?.alcancaveis);

    return {
      periodo: { desde: p.desde, ate: p.ate, dias: p.dias, granularidade: p.granularidade },
      resumo: {
        total: num(resumoRow?.total),
        enviadas,
        falhas,
        naFila: num(resumoRow?.na_fila),
        agendadas: num(resumoRow?.agendadas),
        canceladas: num(resumoRow?.canceladas),
        taxaEntrega: concluidas ? Math.round((enviadas / concluidas) * 100) : null,
        minutosNaFila: numOrNull(resumoRow?.minutos_fila),
        tentativasMedia: numOrNull(resumoRow?.tentativas_media),
      },
      serie,
      porTipo: porTipoRows.map((r) => ({
        tipo: String(r.tipo),
        total: num(r.total),
        enviadas: num(r.enviadas),
        falhas: num(r.falhas),
      })),
      erros: errosRows.map((r) => ({ erro: String(r.erro), total: num(r.total) })),
      porHora,
      alcance: {
        moradores: totalMoradores,
        alcancaveis,
        semTelefone: num(alcanceRow?.sem_telefone),
        optOut: num(alcanceRow?.opt_out),
        percentual: totalMoradores ? Math.round((alcancaveis / totalMoradores) * 100) : null,
        apartamentosSemPrincipal: num(semPrincipalRow?.total),
      },
    };
  }

  // ------------------------------------------------------------------- vagas

  async vagas(tenantId: string) {
    const seisMesesAtras = (() => {
      const hoje = this.toUtc(this.hojeLocal());
      hoje.setUTCMonth(hoje.getUTCMonth() - 5, 1);
      return this.toYmd(hoje);
    })();

    const [[vagasRow], [locRow], porTipoRows, serieRows, contratos] = await Promise.all([
      this.query(
        `SELECT COUNT(*)::int                                          AS total,
                COUNT(*) FILTER (WHERE apartamento_id IS NOT NULL)::int AS vinculadas
           FROM vagas
          WHERE tenant_id = $1 AND ativo`,
        [tenantId],
      ),
      this.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'ativa')::int          AS ativas,
                COUNT(*) FILTER (WHERE status = 'inadimplente')::int    AS inadimplentes,
                COUNT(*) FILTER (WHERE status = 'encerrada')::int       AS encerradas,
                COALESCE(SUM(valor_mensal) FILTER (WHERE status = 'ativa'), 0)::float        AS receita_ativa,
                COALESCE(SUM(valor_mensal) FILTER (WHERE status = 'inadimplente'), 0)::float AS receita_risco
           FROM vagas_locacao
          WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.query(
        `SELECT v.tipo,
                COUNT(*)::int                                                          AS total,
                COUNT(*) FILTER (WHERE v.apartamento_id IS NOT NULL OR l.id IS NOT NULL)::int AS ocupadas
           FROM vagas v
           LEFT JOIN LATERAL (
                SELECT lo.id FROM vagas_locacao lo
                 WHERE lo.vaga_id = v.id AND lo.status IN ('ativa','inadimplente')
                 LIMIT 1) l ON true
          WHERE v.tenant_id = $1 AND v.ativo
          GROUP BY v.tipo
          ORDER BY total DESC`,
        [tenantId],
      ),
      this.query(
        `SELECT to_char(date_trunc('month', data_inicio), 'YYYY-MM-DD') AS bucket,
                COUNT(*)::int                                            AS novas,
                COALESCE(SUM(valor_mensal), 0)::float                    AS valor
           FROM vagas_locacao
          WHERE tenant_id = $1 AND data_inicio >= $2::date
          GROUP BY 1`,
        [tenantId, seisMesesAtras],
      ),
      this.query(
        // data_inicio é DATE: devolve como texto para não depender do parser do driver.
        `SELECT l.id, v.numero, v.tipo, l.status,
                l.valor_mensal::float AS valor, l.dia_vencimento,
                to_char(l.data_inicio, 'YYYY-MM-DD') AS data_inicio,
                m.nome AS morador, a.identificador AS apartamento
           FROM vagas_locacao l
           JOIN vagas v ON v.id = l.vaga_id
           LEFT JOIN moradores m ON m.id = l.morador_id
           LEFT JOIN apartamentos a ON a.id = m.apartamento_id
          WHERE l.tenant_id = $1 AND l.status IN ('ativa','inadimplente')
          ORDER BY (l.status = 'inadimplente') DESC, l.dia_vencimento ASC
          LIMIT 20`,
        [tenantId],
      ),
    ]);

    const totalVagas = num(vagasRow?.total);
    const ocupadas = porTipoRows.reduce((acc, r) => acc + num(r.ocupadas), 0);

    // Série de 6 meses de novas locações (contratos assinados por mês).
    const buckets: Bucket[] = [];
    {
      const dt = this.toUtc(seisMesesAtras);
      for (let i = 0; i < 6; i++) {
        const key = this.toYmd(dt);
        buckets.push({ key, label: this.rotuloMes(key) });
        dt.setUTCMonth(dt.getUTCMonth() + 1);
      }
    }
    const serieMap = new Map(serieRows.map((r) => [String(r.bucket), r]));
    const serie = buckets.map((b) => ({
      label: b.label,
      data: b.key,
      novas: num(serieMap.get(b.key)?.novas),
      valor: num(serieMap.get(b.key)?.valor),
    }));

    return {
      resumo: {
        totalVagas,
        vinculadas: num(vagasRow?.vinculadas),
        ocupadas,
        livres: Math.max(0, totalVagas - ocupadas),
        taxaOcupacao: totalVagas ? Math.round((ocupadas / totalVagas) * 100) : 0,
        locacoesAtivas: num(locRow?.ativas),
        inadimplentes: num(locRow?.inadimplentes),
        encerradas: num(locRow?.encerradas),
        receitaMensal: num(locRow?.receita_ativa),
        receitaEmRisco: num(locRow?.receita_risco),
      },
      porTipo: porTipoRows.map((r) => ({
        tipo: String(r.tipo),
        total: num(r.total),
        ocupadas: num(r.ocupadas),
        livres: Math.max(0, num(r.total) - num(r.ocupadas)),
      })),
      serie,
      contratos: contratos.map((r) => ({
        id: String(r.id),
        numero: String(r.numero),
        tipo: String(r.tipo),
        status: String(r.status),
        valor: num(r.valor),
        diaVencimento: num(r.dia_vencimento),
        dataInicio: String(r.data_inicio),
        morador: (r.morador as string | null) ?? null,
        apartamento: (r.apartamento as string | null) ?? null,
      })),
    };
  }
}
