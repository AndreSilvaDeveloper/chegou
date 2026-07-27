import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Estados possíveis de uma sessão no gateway OpenWA. */
export type OpenWaSessionStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'failed';

export interface OpenWaSession {
  id: string;
  name: string;
  status: OpenWaSessionStatus;
  phone: string | null;
  pushName: string | null;
  lastError?: string | null;
}

export interface OpenWaQrCode {
  /** Data URL PNG: "data:image/png;base64,..." */
  qrCode: string;
  status: OpenWaSessionStatus;
}

export interface OpenWaWebhook {
  id: string;
  url: string;
  events: string[];
  active?: boolean;
}

/** Erro tipado do gateway — carrega o HTTP status para o chamador decidir (404, 409, 400...). */
export class OpenWaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'OpenWaError';
  }
}

/**
 * Eventos registrados no webhook da sessão. Cobrem status de conexão (para refletir na UI
 * sem polling) e entrega de mensagens (para o futuro controle de disparo/falha).
 */
export const OPENWA_WEBHOOK_EVENTS = [
  'message.received',
  'message.ack',
  'message.failed',
  'session.status',
  'session.authenticated',
  'session.disconnected',
];

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Cliente REST fino do gateway OpenWA (WhatsApp não-oficial, multi-sessão).
 * Base `{OPENWA_BASE_URL}/api`, auth via header `X-API-Key`. Usa `fetch` nativo (Node >= 20).
 */
@Injectable()
export class OpenWaClient {
  private readonly logger = new Logger(OpenWaClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('OPENWA_BASE_URL') ?? '').replace(/\/+$/, '');
    this.apiKey = this.config.get<string>('OPENWA_API_KEY') ?? '';
    this.timeoutMs = this.config.get<number>('OPENWA_TIMEOUT_MS', 15_000);
  }

  /** true quando há base URL + API key configuradas. */
  get configured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.configured) {
      throw new OpenWaError(0, 'OpenWA não configurado (defina OPENWA_BASE_URL e OPENWA_API_KEY)');
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api${path}`, {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // SEM timeout, o padrão do Node espera até 5 min por resposta. Como o
        // worker de disparo é compartilhado por todos os condomínios, uma sessão
        // pendurada no gateway congelaria a fila inteira. Falhar rápido deixa o
        // BullMQ reagendar com backoff, sem prender ninguém.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const nome = (err as Error).name;
      if (nome === 'TimeoutError' || nome === 'AbortError') {
        throw new OpenWaError(
          0,
          `Gateway OpenWA não respondeu em ${this.timeoutMs}ms (${method} ${path})`,
        );
      }
      // Falha de rede (gateway fora do ar, DNS) → status 0.
      throw new OpenWaError(0, `Falha de rede ao acessar OpenWA: ${(err as Error).message}`);
    }

    const text = await res.text();
    const data = text ? safeJson(text) : null;

    if (!res.ok) {
      const raw = (data as { message?: unknown })?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : (raw ?? `OpenWA HTTP ${res.status}`);
      throw new OpenWaError(res.status, String(msg), data);
    }

    return data as T;
  }

  // ---- Sessões ----
  createSession(name: string): Promise<OpenWaSession> {
    return this.req<OpenWaSession>('POST', '/sessions', { name });
  }

  listSessions(): Promise<OpenWaSession[]> {
    return this.req<OpenWaSession[]>('GET', '/sessions?limit=1000');
  }

  getSession(id: string): Promise<OpenWaSession> {
    return this.req<OpenWaSession>('GET', `/sessions/${id}`);
  }

  startSession(id: string): Promise<OpenWaSession> {
    return this.req<OpenWaSession>('POST', `/sessions/${id}/start`);
  }

  stopSession(id: string): Promise<OpenWaSession> {
    return this.req<OpenWaSession>('POST', `/sessions/${id}/stop`);
  }

  deleteSession(id: string): Promise<void> {
    return this.req<void>('DELETE', `/sessions/${id}`);
  }

  /** QR de pareamento. 400 quando a sessão ainda não gerou QR ou já está autenticada. */
  getQrCode(id: string): Promise<OpenWaQrCode> {
    return this.req<OpenWaQrCode>('GET', `/sessions/${id}/qr`);
  }

  // ---- Webhooks ----
  listWebhooks(id: string): Promise<OpenWaWebhook[]> {
    return this.req<OpenWaWebhook[]>('GET', `/sessions/${id}/webhooks`);
  }

  createWebhook(id: string, url: string, events: string[] = OPENWA_WEBHOOK_EVENTS): Promise<OpenWaWebhook> {
    return this.req<OpenWaWebhook>('POST', `/sessions/${id}/webhooks`, { url, events });
  }

  // ---- Contatos ----
  /**
   * Resolve um número para o JID canônico do WhatsApp (trata o "nono dígito" brasileiro
   * automaticamente). `whatsappId` vem no formato nativo do engine (ex.: `553299712094@c.us`).
   */
  checkNumber(id: string, number: string): Promise<{ number: string; exists: boolean; whatsappId: string | null }> {
    return this.req('GET', `/sessions/${id}/contacts/check/${encodeURIComponent(number)}`);
  }

  // ---- Mensagens ----
  sendText(id: string, chatId: string, text: string): Promise<{ messageId: string; timestamp: number }> {
    return this.req('POST', `/sessions/${id}/messages/send-text`, { chatId, text });
  }
}
