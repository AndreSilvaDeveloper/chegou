import { Apartamento, Encomenda, Morador, Tenant } from '../../database/entities';

/**
 * Os textos que o morador recebe.
 *
 * **Não há personalização por condomínio.** Cada tipo de mensagem tem cinco
 * versões e o sistema sorteia uma no momento do enfileiramento. É regra
 * anti-bloqueio, não estética: o WhatsApp não-oficial marca como spam o número
 * que dispara o mesmo texto para dezenas de destinatários. Cinco redações
 * diferentes + a saudação do horário + as variáveis do morador fazem duas
 * mensagens seguidas do mesmo condomínio nunca serem iguais.
 *
 * Ao mexer aqui: mantenha as cinco versões **realmente diferentes** entre si
 * (estrutura, tamanho e uso de emoji), não só sinônimos trocados — parágrafos
 * com a mesma forma continuam parecendo o mesmo disparo.
 */

/**
 * Versões da notificação de chegada de encomenda.
 *
 * Toda versão precisa carregar o mínimo operacional: quem é (`{{nome}}`), onde
 * está (`{{unidade}}` / `{{condominio}}`) e o `{{codigo}}` — sem ele o morador
 * não retira.
 */
export const TEMPLATES_ENCOMENDA: string[] = [
  [
    '{{saudacao}}, {{nome}}! 📦',
    '',
    'Chegou uma encomenda para a unidade *{{unidade}}* na portaria do {{condominio}}.',
    '',
    '📅 Recebida em {{data}} às {{hora}}',
    '📦 Tipo: {{tipo}}',
    '🚚 Transportadora: {{transportadora}}',
    '',
    '🔑 Código de retirada: *{{codigo}}*',
    'Apresente este código na portaria para retirar. 🙂',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}!',
    '',
    'Sua encomenda acabou de chegar na portaria do {{condominio}} e já está separada para a unidade {{unidade}}.',
    '',
    'Código de retirada: *{{codigo}}*',
    '',
    'É só passar na portaria e informar esse código. 😉',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}, tudo bem?',
    '',
    'Recebemos uma encomenda para você aqui na portaria — {{transportadora}}, em {{data}} às {{hora}}.',
    '',
    'Para retirar é simples: passe na portaria da unidade {{unidade}} e informe o código *{{codigo}}*.',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}! 👋',
    '',
    'Você tem uma encomenda aguardando retirada na portaria do {{condominio}}.',
    '',
    '• Unidade: {{unidade}}',
    '• Recebida: {{data}}, {{hora}}',
    '• Entregue por: {{transportadora}}',
    '',
    'Código para retirar: *{{codigo}}*',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}!',
    '',
    'Uma encomenda para a unidade {{unidade}} foi recebida na portaria do {{condominio}} em {{data}}, às {{hora}}.',
    '',
    'Quando puder, passe na portaria com o código *{{codigo}}* para retirar. Obrigado!',
  ].join('\n'),
];

/**
 * Versões da confirmação de retirada.
 *
 * Nenhuma tem `{{codigo}}` de propósito: o código já foi usado, repeti-lo depois
 * da retirada só confunde o morador.
 */
export const TEMPLATES_RETIRADA: string[] = [
  [
    '{{saudacao}}, {{nome}}! ✅',
    '',
    'Confirmamos a retirada da encomenda da unidade *{{unidade}}* na portaria do {{condominio}}.',
    '',
    '📅 Retirada em {{data}} às {{hora}}',
    '',
    'Obrigado! 🙂',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}!',
    '',
    'Sua encomenda foi retirada na portaria do {{condominio}} em {{data}}, às {{hora}}.',
    '',
    'Qualquer dúvida, é só falar com a portaria. 👍',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}! 📦',
    '',
    'Registramos a retirada da encomenda da unidade {{unidade}} às {{hora}} de {{data}}.',
    '',
    'Tudo certo por aqui. Obrigado!',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}!',
    '',
    'Encomenda entregue. 🙌',
    '',
    '• Unidade: {{unidade}}',
    '• Retirada em: {{data}}, {{hora}}',
    '• Portaria: {{condominio}}',
    '',
    'Não reconhece esta retirada? Fale com a portaria.',
  ].join('\n'),

  [
    '{{saudacao}}, {{nome}}!',
    '',
    'A encomenda da unidade {{unidade}} foi retirada na portaria do {{condominio}} em {{data}} às {{hora}}.',
    '',
    'Obrigado, e até a próxima!',
  ].join('\n'),
];

function sortear(versoes: string[]): string {
  return versoes[Math.floor(Math.random() * versoes.length)];
}

/** Sorteia uma das versões da chegada de encomenda. Chamada por envio. */
export function sortearTemplateEncomenda(): string {
  return sortear(TEMPLATES_ENCOMENDA);
}

/** Sorteia uma das versões da confirmação de retirada. Chamada por envio. */
export function sortearTemplateRetirada(): string {
  return sortear(TEMPLATES_RETIRADA);
}

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

/** Hora cheia (0–23) de um instante no fuso de referência. */
function horaLocal(d: Date): number {
  const valor = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return Number(valor.replace(/\D/g, '')) || 0;
}

export type Saudacao = 'Bom dia' | 'Boa tarde' | 'Boa noite';

/** Saudação correspondente a um instante (fuso America/Sao_Paulo). */
export function saudacaoPara(quando: Date): Saudacao {
  const h = horaLocal(quando);
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  // Fecha as duas pontas: 18h–23h e a madrugada (0h–4h). A janela de envio
  // padrão não alcança a madrugada, mas o superadmin pode esticá-la.
  return 'Boa noite';
}

const RE_SAUDACAO = /\{\{\s*saudacao\s*\}\}/gi;

/**
 * Troca `{{saudacao}}` pela saudação do horário em que a mensagem VAI SAIR.
 *
 * Roda separado do resto da renderização porque o conteúdo é montado quando o
 * porteiro registra a encomenda, e o envio acontece depois — fila, intervalo
 * anti-bloqueio e janela de horário no meio. Uma encomenda registrada às 20h55
 * pode sair às 8h do dia seguinte; resolvido no registro, o morador receberia
 * "Boa noite" de manhã. Quem chama é o `NotificationService`, que é onde o
 * horário de envio finalmente se conhece.
 */
export function aplicarSaudacao(conteudo: string, quando: Date): string {
  return conteudo.replace(RE_SAUDACAO, saudacaoPara(quando));
}

/**
 * Substitui {{token}} (case-insensitive, tolera espaços) pelos valores. Tokens
 * desconhecidos viram string vazia para não vazar `{{...}}` na mensagem.
 *
 * A exceção é `{{saudacao}}`: sem valor no mapa, ele ATRAVESSA intacto, para o
 * agendamento resolvê-lo depois (ver `aplicarSaudacao`).
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const lookup: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) lookup[k.toLowerCase()] = v;

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, raw: string) => {
    const key = raw.toLowerCase();
    const canonical = TOKEN_ALIASES[key] ?? key;
    if (canonical === 'saudacao' && lookup.saudacao === undefined) return match;
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
