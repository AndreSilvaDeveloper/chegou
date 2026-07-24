import { Encomenda, Morador, Tenant } from '../../database/entities';

/**
 * Template padrão de notificação de encomenda. O condomínio pode personalizar o seu
 * (config `whatsappTemplateEncomenda`); quando vazio, este é usado.
 */
export const DEFAULT_TEMPLATE_ENCOMENDA = [
  'Olá, {{nome}}! 📦',
  '',
  'Chegou uma encomenda para a unidade *{{unidade}}* na portaria do {{condominio}}.',
  '',
  '📅 Recebida em {{data}} às {{hora}}',
  '📦 Tipo: {{tipo}}',
  '🚚 Transportadora: {{transportadora}}',
  '',
  '🔑 Código de retirada: *{{codigo}}*',
  'Apresente este código na portaria para retirar. 🙂',
].join('\n');

/** Metadados das variáveis disponíveis no template (para exibir na UI de edição). */
export interface TemplateVariavel {
  token: string;
  descricao: string;
  exemplo: string;
}

export const VARIAVEIS_ENCOMENDA: TemplateVariavel[] = [
  { token: 'nome', descricao: 'Primeiro nome do morador destinatário', exemplo: 'João' },
  { token: 'morador', descricao: 'Nome completo do morador', exemplo: 'João da Silva' },
  { token: 'unidade', descricao: 'Bloco + apartamento', exemplo: 'A-101' },
  { token: 'condominio', descricao: 'Nome do condomínio', exemplo: 'Residencial Aurora' },
  { token: 'codigo', descricao: 'Código de retirada (4 dígitos)', exemplo: '4827' },
  { token: 'tipo', descricao: 'Tipo da encomenda (caixa/envelope)', exemplo: 'caixa' },
  { token: 'transportadora', descricao: 'Transportadora que entregou', exemplo: 'Correios' },
  { token: 'data', descricao: 'Data do recebimento', exemplo: '24/07/2026' },
  { token: 'hora', descricao: 'Hora do recebimento', exemplo: '14:35' },
];

/** Aliases aceitos no template → token canônico (compatibilidade com nomes alternativos). */
const TOKEN_ALIASES: Record<string, string> = {
  nome_remetente: 'nome',
  primeiro_nome: 'nome',
  nome_completo: 'morador',
  destinatario: 'morador',
  bloco_ap: 'unidade',
  bloco_apartamento: 'unidade',
  apartamento: 'unidade',
};

const TZ = 'America/Sao_Paulo';

function fmtData(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function fmtHora(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Substitui {{token}} (case-insensitive, tolera espaços) pelos valores. Tokens
 * desconhecidos viram string vazia para não vazar `{{...}}` na mensagem.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) lookup[k.toLowerCase()] = v;

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, raw: string) => {
    const key = raw.toLowerCase();
    const canonical = TOKEN_ALIASES[key] ?? key;
    return lookup[canonical] ?? '';
  });
}

/**
 * Monta o mapa de variáveis de uma encomenda para renderização do template.
 * Requer `encomenda.apartamento` e `encomenda.tenant` (ou passe o tenant explicitamente).
 */
export function buildEncomendaVars(
  encomenda: Encomenda,
  morador: Morador,
  tenant: Tenant,
): Record<string, string> {
  const primeiroNome = (morador.nome ?? '').trim().split(/\s+/)[0] || morador.nome || '';
  const unidade = encomenda.apartamento?.identificador ?? '';
  return {
    nome: primeiroNome,
    morador: morador.nome ?? '',
    unidade,
    condominio: tenant.nome ?? '',
    codigo: encomenda.codigoRetirada,
    tipo: encomenda.tipo ?? 'encomenda',
    transportadora: encomenda.transportadora?.trim() || 'não informada',
    data: fmtData(encomenda.createdAt),
    hora: fmtHora(encomenda.createdAt),
  };
}

/** Resolve o template efetivo do condomínio (custom ou padrão). */
export function resolveTemplateEncomenda(custom?: string | null): string {
  const t = (custom ?? '').trim();
  return t.length > 0 ? t : DEFAULT_TEMPLATE_ENCOMENDA;
}
