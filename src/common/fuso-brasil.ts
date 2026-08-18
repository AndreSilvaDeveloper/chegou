/**
 * Fronteiras de dia e de mês no fuso do condomínio.
 *
 * O banco guarda `timestamptz`, mas "hoje" e "este mês" são perguntas locais:
 * uma encomenda recebida às 22h do dia 31 pertence àquele mês para quem está na
 * portaria, e ao mês seguinte em UTC. Todo recorte por data passa por aqui — é
 * o que impede o dashboard do síndico e o resumo da administradora de
 * discordarem sobre o mesmo número.
 *
 * O offset é fixo em `-03:00` porque o Brasil não tem mais horário de verão.
 * Se voltar, é **este** arquivo que muda — e só ele.
 */
export const FUSO_BRASIL = 'America/Sao_Paulo';

/** Um dia do calendário local, sem hora e sem fuso embutido. */
export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Y/M/D no fuso local a partir de um instante. */
export function ymdLocal(d: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_BRASIL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { y: g('year'), m: g('month'), d: g('day') };
}

/** Anda no calendário sem cair na aritmética de horas do `Date` local. */
export function somarDias({ y, m, d }: Ymd, delta: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Meia-noite local do dia, no formato que o Postgres compara com `timestamptz`. */
export function inicioDoDia({ y, m, d }: Ymd): string {
  return `${y}-${pad2(m)}-${pad2(d)} 00:00:00-03:00`;
}

/** Meia-noite local do dia 1º do mês. */
export function inicioDoMes(y: number, m: number): string {
  return `${y}-${pad2(m)}-01 00:00:00-03:00`;
}

/** Chave `YYYY-MM-DD` de um dia — o rótulo com que as séries agrupam. */
export function chaveDoDia({ y, m, d }: Ymd): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function mesSeguinte(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

export function mesAnterior(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}
