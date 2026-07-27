/**
 * Dinheiro, data e competência — a formatação que toda tela financeira repete.
 *
 * Morava em `components/vagas/vagas-shared.tsx`; saiu de lá quando a tela de
 * Assinatura precisou do mesmo formato e teria que importar de dentro do módulo
 * Vagas. `vagas-shared` reexporta, então quem já importava de lá continua igual.
 *
 * O `Relatorios.tsx` mantém a versão dele de propósito: KPI arredondado, sem
 * centavos. Não unifique — lá o centavo é ruído, aqui é o valor da fatura.
 */

export const fmtMoeda = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** YYYY-MM-DD → dd/MM/yyyy, sem passar por `Date` (que embaralharia o fuso). */
export function fmtData(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** YYYY-MM-01 → "Agosto de 2026" */
export function fmtCompetencia(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** Data local (fuso do condomínio) no formato YYYY-MM-DD. */
export function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Competência atual no formato YYYY-MM. */
export function competenciaAtual(): string {
  return hojeLocal().slice(0, 7);
}

/** Competência do mês anterior — o que normalmente se fatura. */
export function competenciaAnterior(): string {
  const [ano, mes] = competenciaAtual().split('-').map(Number);
  return mes === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}
