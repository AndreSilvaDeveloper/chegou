import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  inicioDoDia,
  inicioDoMes,
  mesAnterior,
  mesSeguinte,
  somarDias,
  ymdLocal,
} from '../../common/fuso-brasil';

/** A saúde do WhatsApp de um condomínio, sem falar com o gateway. */
export interface ResumoWhatsapp {
  /** Último status conhecido da sessão (`tenants.whatsapp_status`). */
  status: string | null;
  conectado: boolean;
  numero: string | null;
  /** Saídas dos últimos 7 dias, e quantas delas falharam. */
  enviadas7d: number;
  falhas7d: number;
}

/** O condomínio em números — o que não depende de quem está perguntando. */
export interface ResumoCondominio {
  tenantId: string;
  apartamentos: number;
  moradores: number;
  /** Moradores ativos com telefone **e** que aceitam receber — o alcance real. */
  moradoresComWhatsapp: number;
  encomendasMes: number;
  encomendasMesAnterior: number;
  /** Aguardando ou notificada: o que ainda está na portaria. */
  aguardando: number;
  /** Média de horas entre receber e entregar, nos últimos 30 dias. */
  tempoMedioHoras: number | null;
  whatsapp: ResumoWhatsapp;
}

interface LinhaTenantWhatsapp {
  id: string;
  whatsapp_status: string | null;
  whatsapp_numero: string | null;
}

/** Zeros para um condomínio sem nenhum dado — nunca "sem informação". */
export const resumoVazio = (tenantId: string): ResumoCondominio => ({
  tenantId,
  apartamentos: 0,
  moradores: 0,
  moradoresComWhatsapp: 0,
  encomendasMes: 0,
  encomendasMesAnterior: 0,
  aguardando: 0,
  tempoMedioHoras: null,
  whatsapp: { status: null, conectado: false, numero: null, enviadas7d: 0, falhas7d: 0 },
});

/**
 * O condomínio em números, para quem o vê **de fora**.
 *
 * Existe porque a administradora precisa comparar os condomínios da carteira
 * sem entrar em cada um: são muitos condomínios numa tela só, e chamar o
 * dashboard de cada um seria uma request por linha. Aqui é o contrário — cada
 * família de número é **uma consulta agregada** para todos os condomínios de
 * uma vez, com `GROUP BY tenant_id`.
 *
 * Ele **não** decide quem pode ver o quê: quem chama já resolveu isso (a
 * carteira, no caso da administradora; a plataforma, no do superadmin). O
 * serviço só responde sobre os ids que recebeu — nunca busca "todos".
 *
 * A assinatura fica de fora de propósito: quanto o condomínio custa depende de
 * **quem paga por ele**, e isso é do `AssinaturasService`. Aqui só entra o que
 * é do condomínio em si.
 */
@Injectable()
export class ResumoCondominioService {
  constructor(private readonly dataSource: DataSource) {}

  /** Um condomínio só — atalho para as telas de detalhe. */
  async resumirUm(tenantId: string): Promise<ResumoCondominio> {
    const mapa = await this.resumir([tenantId]);
    return mapa.get(tenantId) ?? resumoVazio(tenantId);
  }

  /**
   * Os números de vários condomínios, em quatro consultas no total.
   *
   * Condomínio sem nenhum dado não aparece no `GROUP BY` — por isso o mapa
   * nasce preenchido com zeros. Devolver "sem chave" faria a tela mostrar
   * traço onde o certo é zero.
   */
  async resumir(tenantIds: string[]): Promise<Map<string, ResumoCondominio>> {
    const mapa = new Map(tenantIds.map((id) => [id, resumoVazio(id)]));
    if (tenantIds.length === 0) return mapa;

    const hoje = ymdLocal();
    const mesIni = inicioDoMes(hoje.y, hoje.m);
    const prox = mesSeguinte(hoje.y, hoje.m);
    const mesFim = inicioDoMes(prox.y, prox.m);
    const ant = mesAnterior(hoje.y, hoje.m);
    const mesAntIni = inicioDoMes(ant.y, ant.m);
    const desde30 = inicioDoDia(somarDias(hoje, -30));
    const desde7 = inicioDoDia(somarDias(hoje, -7));

    const [unidades, pessoas, encomendas, mensagens, sessoes] = await Promise.all([
      this.dataSource.query<{ tenant_id: string; total: number }[]>(
        `SELECT tenant_id, COUNT(*)::int AS total
           FROM apartamentos
          WHERE tenant_id = ANY($1::uuid[]) AND ativo = true
          GROUP BY tenant_id`,
        [tenantIds],
      ),
      this.dataSource.query<
        { tenant_id: string; total: number; com_whatsapp: number }[]
      >(
        `SELECT tenant_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (
                  WHERE telefone_e164 IS NOT NULL AND receber_whatsapp = true
                )::int AS com_whatsapp
           FROM moradores
          WHERE tenant_id = ANY($1::uuid[]) AND ativo = true
          GROUP BY tenant_id`,
        [tenantIds],
      ),
      this.dataSource.query<
        {
          tenant_id: string;
          mes: number;
          mes_anterior: number;
          aguardando: number;
          horas: string | null;
        }[]
      >(
        // A média de tempo vem no mesmo agregado (via FILTER) para não custar
        // uma varredura a mais da tabela mais pesada do sistema.
        `SELECT tenant_id,
                COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::int AS mes,
                COUNT(*) FILTER (WHERE created_at >= $4 AND created_at < $2)::int AS mes_anterior,
                COUNT(*) FILTER (WHERE status IN ('aguardando','notificado'))::int AS aguardando,
                EXTRACT(EPOCH FROM AVG(retirada_at - created_at) FILTER (
                  WHERE status = 'retirada' AND retirada_at IS NOT NULL AND retirada_at >= $5
                )) / 3600 AS horas
           FROM encomendas
          WHERE tenant_id = ANY($1::uuid[])
          GROUP BY tenant_id`,
        [tenantIds, mesIni, mesFim, mesAntIni, desde30],
      ),
      this.dataSource.query<{ tenant_id: string; enviadas: number; falhas: number }[]>(
        `SELECT tenant_id,
                COUNT(*) FILTER (WHERE status <> 'failed')::int AS enviadas,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS falhas
           FROM whatsapp_messages
          WHERE tenant_id = ANY($1::uuid[]) AND direction = 'out' AND created_at >= $2
          GROUP BY tenant_id`,
        [tenantIds, desde7],
      ),
      this.dataSource.query<LinhaTenantWhatsapp[]>(
        // O status vem da coluna, não do gateway: perguntar ao OpenWA seria uma
        // chamada HTTP por condomínio, e ele já grava aqui a cada mudança.
        `SELECT id, whatsapp_status, whatsapp_numero
           FROM tenants
          WHERE id = ANY($1::uuid[])`,
        [tenantIds],
      ),
    ]);

    for (const l of unidades) {
      const r = mapa.get(l.tenant_id);
      if (r) r.apartamentos = Number(l.total);
    }
    for (const l of pessoas) {
      const r = mapa.get(l.tenant_id);
      if (!r) continue;
      r.moradores = Number(l.total);
      r.moradoresComWhatsapp = Number(l.com_whatsapp);
    }
    for (const l of encomendas) {
      const r = mapa.get(l.tenant_id);
      if (!r) continue;
      r.encomendasMes = Number(l.mes);
      r.encomendasMesAnterior = Number(l.mes_anterior);
      r.aguardando = Number(l.aguardando);
      r.tempoMedioHoras = l.horas != null ? Number(l.horas) : null;
    }
    for (const l of mensagens) {
      const r = mapa.get(l.tenant_id);
      if (!r) continue;
      r.whatsapp.enviadas7d = Number(l.enviadas);
      r.whatsapp.falhas7d = Number(l.falhas);
    }
    for (const l of sessoes) {
      const r = mapa.get(l.id);
      if (!r) continue;
      r.whatsapp.status = l.whatsapp_status;
      r.whatsapp.numero = l.whatsapp_numero;
      r.whatsapp.conectado = l.whatsapp_status === 'ready';
    }

    return mapa;
  }
}
