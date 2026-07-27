import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

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

/** Até quantos dias empurrar uma mensagem que não coube na cota do dia. */
const MAX_DIAS_ADIAMENTO = 14;

/** Quanto tempo o slot e a cota ficam no Redis (folga sobre o adiamento máximo). */
const TTL_SLOT_MS = 3 * DAY_MS;
const TTL_COTA_MS = 3 * DAY_MS;

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

/** Dia local (YYYY-MM-DD) de um instante — é a chave da cota diária. */
function diaLocal(ms: number): string {
  const p = localParts(new Date(ms));
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.da).padStart(2, '0')}`;
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
 * Reserva o próximo horário livre do condomínio, de forma ATÔMICA.
 *
 * Ler o slot e gravar o próximo em dois comandos separados deixava duas
 * encomendas registradas no mesmo segundo (dois porteiros, ou duas réplicas da
 * API) receberem o MESMO horário — duas mensagens saindo juntas pelo mesmo
 * número, que é exatamente o padrão de rajada que o WhatsApp bloqueia. Em Lua o
 * read-modify-write acontece dentro do Redis, sem janela para corrida.
 */
const LUA_RESERVAR = `
local ultimo = tonumber(redis.call('GET', KEYS[1]) or '0')
local agora  = tonumber(ARGV[1])
local minimo = tonumber(ARGV[2])
local passo  = tonumber(ARGV[3])
local ttl    = tonumber(ARGV[4])
local slot = agora
if ultimo > slot then slot = ultimo end
if minimo > slot then slot = minimo end
redis.call('SET', KEYS[1], slot + passo, 'PX', ttl)
return tostring(slot)
`;

/** Empurra o próximo slot para frente (nunca para trás) depois de ajustar a janela. */
const LUA_EMPURRAR = `
local atual = tonumber(redis.call('GET', KEYS[1]) or '0')
local alvo  = tonumber(ARGV[1])
if alvo > atual then
  redis.call('SET', KEYS[1], alvo, 'PX', tonumber(ARGV[2]))
end
return 1
`;

/**
 * Consome uma unidade da cota do dia. Devolve 1 se coube, 0 se o dia está cheio.
 * INCR + checagem no mesmo script: sem isso, N enfileiramentos simultâneos
 * passariam todos pela verificação antes de qualquer um incrementar.
 */
const LUA_COTA = `
local usados = redis.call('INCR', KEYS[1])
if usados == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2])) end
if usados > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

/**
 * Agenda o disparo respeitando as regras anti-bloqueio, por número (tenant):
 *  - intervalo fixo + jitter aleatório ENTRE mensagens (slot serializado no Redis);
 *  - janela de horário (só envia entre início e fim);
 *  - limite diário por número.
 * Retorna o delay (ms) que o job deve aguardar na fila.
 */
@Injectable()
export class DispatchSchedulerService {
  private readonly logger = new Logger(DispatchSchedulerService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private slotKey(tenantId: string): string {
    return `wa:slot:${tenantId}`;
  }

  /** Cota do condomínio no dia em que a mensagem VAI SAIR (não no dia em que foi criada). */
  private cotaKey(tenantId: string, dia: string): string {
    return `wa:cota:${tenantId}:${dia}`;
  }

  /**
   * Reserva o próximo slot de envio do condomínio e devolve o delay (ms) do job.
   *
   * O laço existe porque o dia reservado pode estar com a cota cheia: nesse caso
   * a mensagem vai para a abertura da janela seguinte e disputa a cota de lá.
   */
  async reserve(tenantId: string, cfg: AntiBanConfig): Promise<number> {
    const agora = Date.now();
    const jitter = Math.floor(Math.random() * Math.max(0, cfg.jitterSegundos + 1));
    const passo = (Math.max(0, cfg.intervaloSegundos) + jitter) * 1000;

    let minimo = agora;

    for (let tentativa = 0; tentativa < MAX_DIAS_ADIAMENTO; tentativa++) {
      const bruto = await this.reservarSlot(tenantId, agora, minimo, passo);

      // A janela pode jogar o slot para a abertura seguinte; o próximo slot do
      // condomínio precisa acompanhar, senão a fila inteira se acumula no minuto
      // em que a janela abre.
      const agendado = ajustarParaJanela(new Date(bruto), cfg.horarioEnvioInicio, cfg.horarioEnvioFim).getTime();
      if (agendado !== bruto) {
        await this.empurrarSlot(tenantId, agendado + passo);
      }

      if (cfg.limiteDiario <= 0) return Math.max(0, agendado - agora);

      const coube = await this.consumirCota(tenantId, diaLocal(agendado), cfg.limiteDiario);
      if (coube) return Math.max(0, agendado - agora);

      this.logger.warn(
        `Cota diária (${cfg.limiteDiario}) cheia em ${diaLocal(agendado)} p/ tenant ${tenantId} — tentando o dia seguinte`,
      );
      minimo = proximaAbertura(new Date(agendado), cfg.horarioEnvioInicio).getTime();
    }

    // Nem em duas semanas coube: a demanda do condomínio está acima do que o
    // número aguenta. Agenda mesmo assim (mensagem não pode sumir), mas com um
    // registro barulhento — é sinal de aumentar o limite ou reduzir o disparo.
    const ultimo = await this.reservarSlot(tenantId, agora, minimo, passo);
    this.logger.error(
      `Tenant ${tenantId}: cota diária cheia por ${MAX_DIAS_ADIAMENTO} dias seguidos — ` +
        `agendando fora da cota para ${new Date(ultimo).toISOString()}`,
    );
    return Math.max(0, ultimo - agora);
  }

  private async reservarSlot(
    tenantId: string,
    agora: number,
    minimo: number,
    passo: number,
  ): Promise<number> {
    const slot = (await this.redis.eval(
      LUA_RESERVAR,
      1,
      this.slotKey(tenantId),
      String(agora),
      String(minimo),
      String(passo),
      String(TTL_SLOT_MS),
    )) as string;
    return Number(slot);
  }

  private async empurrarSlot(tenantId: string, alvo: number): Promise<void> {
    await this.redis.eval(
      LUA_EMPURRAR,
      1,
      this.slotKey(tenantId),
      String(alvo),
      String(TTL_SLOT_MS),
    );
  }

  private async consumirCota(tenantId: string, dia: string, limite: number): Promise<boolean> {
    const ok = (await this.redis.eval(
      LUA_COTA,
      1,
      this.cotaKey(tenantId, dia),
      String(limite),
      String(TTL_COTA_MS),
    )) as number;
    return ok === 1;
  }
}
