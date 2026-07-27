import { Apartamento, Encomenda, Morador, Tenant } from '../../database/entities';

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

/**
 * Template padrão da confirmação de retirada. Mesma lógica do de chegada: o
 * condomínio pode personalizar (config `whatsappTemplateRetirada`) e, vazio,
 * vale este. Mora aqui — e não em `whatsapp/templates.ts` — justamente porque
 * é personalizável; lá ficam só os textos fixos do sistema.
 */
export const DEFAULT_TEMPLATE_RETIRADA = [
  'Olá, {{nome}}! ✅',
  '',
  'Confirmamos a retirada da encomenda da unidade *{{unidade}}* na portaria do {{condominio}}.',
  '',
  '📅 Retirada em {{data}} às {{hora}}',
  '',
  'Obrigado! 🙂',
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

/**
 * Variáveis da confirmação de retirada. Sem `{{codigo}}` de propósito: o código
 * já foi usado, repeti-lo depois da retirada só confunde o morador.
 */
export const VARIAVEIS_RETIRADA: TemplateVariavel[] = [
  { token: 'nome', descricao: 'Primeiro nome do morador que retirou', exemplo: 'João' },
  { token: 'morador', descricao: 'Nome completo do morador', exemplo: 'João da Silva' },
  { token: 'unidade', descricao: 'Bloco + apartamento', exemplo: 'A-101' },
  { token: 'condominio', descricao: 'Nome do condomínio', exemplo: 'Residencial Aurora' },
  { token: 'tipo', descricao: 'Tipo da encomenda (caixa/envelope)', exemplo: 'caixa' },
  { token: 'transportadora', descricao: 'Transportadora que entregou', exemplo: 'Correios' },
  { token: 'data', descricao: 'Data da retirada', exemplo: '27/07/2026' },
  { token: 'hora', descricao: 'Hora da retirada', exemplo: '18:02' },
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

/**
 * Mapa de variáveis da confirmação de retirada. `data`/`hora` são as da
 * **retirada**, não as do recebimento — é o que o morador acabou de fazer.
 */
export function buildRetiradaVars(
  encomenda: Encomenda,
  morador: Morador,
  tenant: Tenant,
  apartamento: Apartamento,
): Record<string, string> {
  const primeiroNome = (morador.nome ?? '').trim().split(/\s+/)[0] || morador.nome || '';
  const quando = encomenda.retiradaAt ?? new Date();
  return {
    nome: primeiroNome,
    morador: morador.nome ?? '',
    unidade: apartamento.identificador ?? '',
    condominio: tenant.nome ?? '',
    tipo: encomenda.tipo ?? 'encomenda',
    transportadora: encomenda.transportadora?.trim() || 'não informada',
    data: fmtData(quando),
    hora: fmtHora(quando),
  };
}

/** Resolve o template efetivo do condomínio (custom ou padrão). */
export function resolveTemplateEncomenda(custom?: string | null): string {
  const t = (custom ?? '').trim();
  return t.length > 0 ? t : DEFAULT_TEMPLATE_ENCOMENDA;
}

/** Idem, para a confirmação de retirada. */
export function resolveTemplateRetirada(custom?: string | null): string {
  const t = (custom ?? '').trim();
  return t.length > 0 ? t : DEFAULT_TEMPLATE_RETIRADA;
}
