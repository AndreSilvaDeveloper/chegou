import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { Notificacao } from '../../database/entities';
import { StatusNotificacao } from '../../database/entities/notificacao.entity';

export interface AntiBanConfig {
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string; // "HH:mm"
  horarioEnvioFim: string; // "HH:mm"
}

// América/São_Paulo: sem horário de verão desde 2019 → offset fixo -03:00.
const TZ_OFFSET_MIN = -180;
const TZ = 'America/Sao_Paulo';
const DAY_MS = 24 * 3600 * 1000;

interface WallParts {
  y: number;
  mo: number;
  da: number;
  h: number;
  mi: number;
}

function localParts(d: Date): WallParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { y: get('year'), mo: get('month'), da: get('day'), h: get('hour'), mi: get('minute') };
}

/** Instante UTC (ms) de uma hora-de-parede no fuso America/Sao_Paulo. */
function wallToUtcMs(y: number, mo: number, da: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, da, h, mi) - TZ_OFFSET_MIN * 60000;
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Ajusta um instante para cair dentro da janela de envio [inicio, fim] (horário local).
 * Antes do início → hoje no início. Depois do fim → amanhã no início.
 */
function ajustarParaJanela(candidate: Date, inicio: string, fim: string): Date {
  const iniMin = parseHM(inicio);
  const fimMin = parseHM(fim);
  if (fimMin <= iniMin) return candidate; // janela inválida → não restringe

  const p = localParts(candidate);
  const curMin = p.h * 60 + p.mi;
  const iniH = Math.floor(iniMin / 60);
  const iniM = iniMin % 60;

  if (curMin < iniMin) {
    return new Date(wallToUtcMs(p.y, p.mo, p.da, iniH, iniM));
  }
  if (curMin >= fimMin) {
    return new Date(wallToUtcMs(p.y, p.mo, p.da, iniH, iniM) + DAY_MS);
  }
  return candidate;
}

/** Próxima abertura da janela a partir de agora (usado no cap diário). */
function proximaAbertura(agora: Date, inicio: string): Date {
  const p = localParts(agora);
  const iniMin = parseHM(inicio);
  const iniH = Math.floor(iniMin / 60);
  const iniM = iniMin % 60;
  const hojeAbertura = wallToUtcMs(p.y, p.mo, p.da, iniH, iniM);
  return new Date(hojeAbertura > agora.getTime() ? hojeAbertura : hojeAbertura + DAY_MS);
}

/**
 * Agenda o disparo respeitando as regras anti-bloqueio, por número (tenant):
 *  - intervalo fixo + jitter aleatório ENTRE mensagens (slot serializado no Redis);
 *  - janela de horário (só envia entre início e fim);
 *  - limite diário por número.
 * Retorna o delay (ms) que o job deve aguardar na fila.
 */
@Injectable()
export class DispatchSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(DispatchSchedulerService.name);
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    @InjectRepository(Notificacao) private readonly notificacaoRepo: Repository<Notificacao>,
  ) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: null });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private slotKey(tenantId: string): string {
    return `wa:slot:${tenantId}`;
  }

  /**
   * Reserva o próximo slot de envio do condomínio e devolve o delay (ms) do job.
   * NOTA: get/set do slot não é atômico — aceitável no volume atual (poucos condôminios,
   * enfileiramento esparso). Para escala futura, migrar para Lua/BullMQ groups.
   */
  async reserve(tenantId: string, cfg: AntiBanConfig): Promise<number> {
    const now = Date.now();
    const jitter = Math.floor(Math.random() * Math.max(0, cfg.jitterSegundos + 1));
    const stepMs = (Math.max(0, cfg.intervaloSegundos) + jitter) * 1000;

    const key = this.slotKey(tenantId);
    const last = Number((await this.redis.get(key)) ?? '0');
    let scheduled = Math.max(now, last);

    // Janela de horário
    scheduled = ajustarParaJanela(new Date(scheduled), cfg.horarioEnvioInicio, cfg.horarioEnvioFim).getTime();

    // Cap diário por número
    if (cfg.limiteDiario > 0) {
      const enviadosHoje = await this.contarHoje(tenantId, new Date(scheduled));
      if (enviadosHoje >= cfg.limiteDiario) {
        scheduled = proximaAbertura(new Date(scheduled), cfg.horarioEnvioInicio).getTime();
        this.logger.warn(`Cap diário (${cfg.limiteDiario}) atingido p/ tenant ${tenantId} — adiando p/ próxima janela`);
      }
    }

    await this.redis.set(key, String(scheduled + stepMs), 'PX', 2 * DAY_MS);
    return Math.max(0, scheduled - now);
  }

  /** Conta notificações não canceladas criadas no dia (fuso local) da data informada. */
  private async contarHoje(tenantId: string, ref: Date): Promise<number> {
    const p = localParts(ref);
    const inicioDia = new Date(wallToUtcMs(p.y, p.mo, p.da, 0, 0));
    const fimDia = new Date(inicioDia.getTime() + DAY_MS);
    return this.notificacaoRepo
      .createQueryBuilder('n')
      .where('n.tenant_id = :tenantId', { tenantId })
      .andWhere('n.status != :cancelada', { cancelada: StatusNotificacao.CANCELADA })
      .andWhere('n.created_at >= :ini AND n.created_at < :fim', { ini: inicioDia, fim: fimDia })
      .getCount();
  }
}
