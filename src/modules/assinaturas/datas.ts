/**
 * Datas da assinatura, em texto `YYYY-MM-DD`.
 *
 * Nada aqui passa por `new Date()` para formatar: converter embaralha o fuso e
 * mostra o dia anterior. A única conversão é a de "que dia é hoje", e ela é
 * feita no fuso do produto.
 */

const TZ = 'America/Sao_Paulo';

/** Hoje no fuso do produto, no formato que o banco usa. */
export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Competência `AAAA-MM` → o dia 1 que o banco guarda. */
export function primeiroDia(competencia: string): string {
  return `${competencia}-01`;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** `YYYY-MM-DD` → meia-noite UTC. Só para contas entre datas, nunca para exibir. */
function emUTC(data: string): number {
  const [ano, mes, dia] = data.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/**
 * Quantos dias separam duas datas. Positivo quando `ate` é depois de `de`.
 *
 * As duas pontas são meia-noite **UTC**, não local: em fuso com horário de
 * verão, dois dias vizinhos podem distar 23 ou 25 horas, e a divisão truncaria
 * para zero justamente na virada.
 */
export function diasEntre(de: string, ate: string): number {
  return Math.round((emUTC(ate) - emUTC(de)) / 86_400_000);
}

/**
 * Vencimento da fatura: dia `dia` do mês **seguinte** à competência.
 *
 * A assinatura é pós-paga — a contagem de apartamentos só fecha quando o mês
 * acaba, então cobrar dentro da própria competência seria cobrar um número que
 * ainda vai mudar. Dia 31 em mês de 30 cai no último dia, nunca transborda.
 */
export function vencimentoDaCompetencia(competencia: string, dia: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const anoSeguinte = mes === 12 ? ano + 1 : ano;
  const mesSeguinte = mes === 12 ? 1 : mes + 1;
  const diaFinal = Math.min(dia, ultimoDiaDoMes(anoSeguinte, mesSeguinte));

  return [
    anoSeguinte,
    String(mesSeguinte).padStart(2, '0'),
    String(diaFinal).padStart(2, '0'),
  ].join('-');
}

/** O dia anterior a uma data `YYYY-MM-DD`. Usado para encerrar vigência. */
export function diaAnterior(data: string): string {
  return new Date(emUTC(data) - 86_400_000).toISOString().slice(0, 10);
}
