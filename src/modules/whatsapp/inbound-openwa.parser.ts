import { InboundMessage } from './whatsapp.service';

/** Eventos de mensagem recebida que o gateway pode emitir. */
export const EVENTOS_MENSAGEM = ['message.received', 'message', 'message.any'];

/** Corpo do webhook do OpenWA (campos que nos interessam). */
export interface OpenWaWebhookBody {
  event?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

/** `5532999991234@c.us` / `whatsapp:+5532999991234` → `+5532999991234`. */
export function normalizarJid(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const digitos = valor.split('@')[0].replace(/\D/g, '');
  return digitos ? `+${digitos}` : '';
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Traduz o evento do OpenWA para o formato que o WhatsappService entende.
 *
 * O gateway não tem contrato estável entre versões (`from`/`chatId`/`author`,
 * `body`/`text`/`content`), então lemos por alternativas em vez de assumir uma
 * forma só — e devolvemos `null` quando não dá para extrair o mínimo
 * (identificador, remetente e texto). Melhor ignorar do que gravar mensagem
 * pela metade e responder errado ao morador.
 */
export function parseMensagemOpenWa(body: OpenWaWebhookBody): InboundMessage | null {
  const d = (body?.data ?? {}) as Record<string, unknown>;

  const id = texto(d.id) || texto(d.messageId) || texto(d.key && (d.key as any).id);
  const de = normalizarJid(d.from ?? d.chatId ?? d.author ?? d.sender);
  const para = normalizarJid(d.to ?? d.recipient ?? d.self ?? body.session);
  const corpo = texto(d.body) || texto(d.text) || texto(d.content) || texto(d.caption);

  if (!id || !de || !corpo.trim()) return null;

  // Mensagem que o próprio condomínio enviou volta no webhook — não é entrada.
  if (d.fromMe === true) return null;

  const tipoBruto = texto(d.type) || texto(d.messageType);
  const messageType: InboundMessage['messageType'] =
    tipoBruto === 'image' || tipoBruto === 'interactive' || tipoBruto === 'template'
      ? tipoBruto
      : 'text';

  const timestamp = typeof d.timestamp === 'number' ? d.timestamp : null;

  return {
    providerMessageId: id,
    from: de,
    to: para,
    body: corpo,
    messageType,
    // OpenWA manda epoch em segundos; sem isso, a hora do registro.
    receivedAt: timestamp ? new Date(timestamp * 1000) : new Date(),
    raw: d,
  };
}
