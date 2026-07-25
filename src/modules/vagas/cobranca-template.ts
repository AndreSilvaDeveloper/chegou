/**
 * Mensagem de cobrança do aluguel de vaga.
 *
 * Regra anti-bloqueio nº 7/8: toda mensagem carrega dados específicos do
 * destinatário (nome, vaga, valor, vencimento), então não há dois disparos com
 * texto idêntico.
 */

const TZ = 'America/Sao_Paulo';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** YYYY-MM-DD → "05/08/2026" (sem passar por Date, que embaralharia o fuso). */
export function formatarDataBr(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-01 → "agosto de 2026" */
export function formatarCompetencia(ymd: string): string {
  const [y, m] = ymd.slice(0, 10).split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface CobrancaVars {
  nome: string;
  condominio: string;
  vaga: string;
  competencia: string;
  valor: number;
  vencimento: string;
  boletoUrl?: string | null;
  pixCopiaCola?: string | null;
}

export function montarMensagemCobranca(vars: CobrancaVars): string {
  const primeiroNome = vars.nome.trim().split(/\s+/)[0] || vars.nome;

  const linhas = [
    `Olá, ${primeiroNome}! 🚗`,
    '',
    `Segue a cobrança da vaga *${vars.vaga}* no ${vars.condominio}.`,
    '',
    `📅 Referência: ${formatarCompetencia(vars.competencia)}`,
    `💰 Valor: *${formatarMoeda(vars.valor)}*`,
    `⏰ Vencimento: *${formatarDataBr(vars.vencimento)}*`,
  ];

  // Só aparece quando houver provedor emitindo documento de pagamento.
  if (vars.pixCopiaCola) {
    linhas.push('', '🔑 Pix copia e cola:', vars.pixCopiaCola);
  }
  if (vars.boletoUrl) {
    linhas.push('', `📄 Boleto: ${vars.boletoUrl}`);
  }
  if (!vars.pixCopiaCola && !vars.boletoUrl) {
    linhas.push('', 'Procure a administração do condomínio para efetuar o pagamento.');
  }

  linhas.push('', 'Qualquer dúvida, é só falar com a administração. 🙂');
  return linhas.join('\n');
}

export function montarAssuntoEmail(vars: Pick<CobrancaVars, 'vaga' | 'competencia'>): string {
  return `Cobrança da vaga ${vars.vaga} — ${formatarCompetencia(vars.competencia)}`;
}
