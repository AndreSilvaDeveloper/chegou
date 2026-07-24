import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../database/entities';
import { DEFAULT_TENANT_CONFIG } from '../admin/dto/config-tenant.dto';
import {
  DEFAULT_TEMPLATE_ENCOMENDA,
  TemplateVariavel,
  VARIAVEIS_ENCOMENDA,
} from '../notificacoes/message-template';
import {
  OpenWaClient,
  OpenWaError,
  OpenWaSession,
  OpenWaSessionStatus,
} from './openwa.client';

export interface WhatsappTenantConfig {
  templateEncomenda: string;
  templatePadrao: string;
  variaveis: TemplateVariavel[];
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
}

/** Estado simplificado da conexão para a UI. */
export type ConnectionState = 'connected' | 'connecting' | 'qr' | 'disconnected' | 'error';

export interface ConnectionInfo {
  /** Integração OpenWA habilitada no servidor. */
  configured: boolean;
  /** Já existe uma sessão criada para este condomínio. */
  provisioned: boolean;
  sessionId: string | null;
  sessionName: string | null;
  /** Status cru do gateway (ready, qr_ready, ...) ou null. */
  rawStatus: OpenWaSessionStatus | null;
  /** Estado simplificado para a UI. */
  state: ConnectionState;
  connected: boolean;
  phone: string | null;
  pushName: string | null;
  lastError: string | null;
}

export interface QrInfo {
  state: ConnectionState;
  rawStatus: OpenWaSessionStatus | null;
  connected: boolean;
  /** Data URL PNG do QR, ou null quando conectado / ainda não disponível. */
  qrCode: string | null;
}

function toState(status: OpenWaSessionStatus | null): ConnectionState {
  switch (status) {
    case 'ready':
      return 'connected';
    case 'qr_ready':
      return 'qr';
    case 'initializing':
    case 'authenticating':
      return 'connecting';
    case 'failed':
      return 'error';
    case 'disconnected':
    case 'created':
    default:
      return 'disconnected';
  }
}

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Sessão do condomínio inexistente ou não conectada no momento do disparo. */
export class OpenWaNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenWaNotConnectedError';
  }
}

/** Telefone E.164 (ou dígitos) → JID de contato do WhatsApp (`55...@c.us`). */
function toChatId(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return `${digits}@c.us`;
}

/** Campos de `tenants` que a integração escreve (evita conflito de tipo com o jsonb `configJson`). */
type TenantWhatsappPatch = Partial<
  Pick<Tenant, 'whatsappSessionId' | 'whatsappSessionName' | 'whatsappStatus' | 'whatsappNumero'>
>;

/**
 * Orquestra a sessão OpenWA de cada condomínio: provisionamento (criação da instância),
 * conexão via QR, status e desconexão. Persiste id/nome/status na tabela `tenants`.
 */
@Injectable()
export class OpenwaService {
  private readonly logger = new Logger(OpenwaService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly client: OpenWaClient,
    private readonly config: ConfigService,
  ) {}

  get configured(): boolean {
    return this.client.configured;
  }

  /** Nome da sessão no gateway, derivado do slug (sanitizado ao formato aceito: [a-z0-9-], 3–50). */
  private sessionName(tenant: Tenant): string {
    const prefix = this.config.get<string>('OPENWA_SESSION_PREFIX') ?? 'chegou';
    const base = `${prefix}-${tenant.slug}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return base.length >= 3 ? base : `${base}-wa`.slice(0, 50);
  }

  private async persist(tenantId: string, session: OpenWaSession): Promise<void> {
    const patch: TenantWhatsappPatch = {
      whatsappSessionId: session.id,
      whatsappSessionName: session.name,
      whatsappStatus: session.status,
    };
    // Só grava o número quando o gateway o expõe (sessão autenticada); não apaga o já salvo.
    if (session.phone) patch.whatsappNumero = session.phone;
    await this.tenantRepo.update(tenantId, patch);
  }

  /**
   * Best-effort: cria a instância OpenWA do condomínio. Chamado na criação do tenant —
   * NUNCA lança (uma falha no gateway não pode impedir o cadastro do condomínio).
   */
  async provisionForTenant(tenantId: string): Promise<void> {
    if (!this.configured) return;
    try {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (!tenant || tenant.whatsappSessionId) return;
      const session = await this.ensureSession(tenant);
      this.logger.log(`Sessão OpenWA provisionada p/ condomínio ${tenant.slug}: ${session.name} (${session.id})`);
    } catch (err) {
      this.logger.warn(`Falha ao provisionar sessão OpenWA p/ tenant ${tenantId}: ${errMsg(err)}`);
    }
  }

  private async loadTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    return tenant;
  }

  /**
   * Garante que a sessão existe no gateway e está persistida no tenant.
   * Recria se a sessão salva sumiu (404). Adota a existente em caso de conflito de nome (409).
   */
  private async ensureSession(tenant: Tenant): Promise<OpenWaSession> {
    if (tenant.whatsappSessionId) {
      try {
        const session = await this.client.getSession(tenant.whatsappSessionId);
        await this.persist(tenant.id, session);
        return session;
      } catch (err) {
        if (!(err instanceof OpenWaError) || err.status !== 404) throw err;
        // sessão salva não existe mais no gateway → cai para recriação
        this.logger.warn(`Sessão OpenWA ${tenant.whatsappSessionId} sumiu no gateway — recriando`);
      }
    }

    const name = this.sessionName(tenant);
    let session: OpenWaSession;
    try {
      session = await this.client.createSession(name);
    } catch (err) {
      if (err instanceof OpenWaError && err.status === 409) {
        // nome já existe no gateway (ex.: re-provisionamento) → adota a sessão existente
        const all = await this.client.listSessions();
        const found = all.find((s) => s.name === name);
        if (!found) throw err;
        session = found;
      } else {
        throw err;
      }
    }
    await this.persist(tenant.id, session);
    return session;
  }

  private buildInfo(tenant: Tenant, session: OpenWaSession | null): ConnectionInfo {
    const rawStatus = (session?.status ?? null) as OpenWaSessionStatus | null;
    const state = session ? toState(rawStatus) : 'disconnected';
    return {
      configured: true,
      provisioned: Boolean(session),
      sessionId: session?.id ?? tenant.whatsappSessionId ?? null,
      sessionName: session?.name ?? tenant.whatsappSessionName ?? null,
      rawStatus,
      state,
      connected: rawStatus === 'ready',
      phone: session?.phone ?? tenant.whatsappNumero ?? null,
      pushName: session?.pushName ?? null,
      lastError: session?.lastError ?? null,
    };
  }

  private notConfigured(): ConnectionInfo {
    return {
      configured: false,
      provisioned: false,
      sessionId: null,
      sessionName: null,
      rawStatus: null,
      state: 'disconnected',
      connected: false,
      phone: null,
      pushName: null,
      lastError: null,
    };
  }

  /** Status atual da conexão do condomínio (provisiona a sessão de forma preguiçosa se ainda não existir). */
  async getConnection(tenantId: string): Promise<ConnectionInfo> {
    if (!this.configured) return this.notConfigured();
    const tenant = await this.loadTenant(tenantId);
    try {
      const session = await this.ensureSession(tenant);
      return this.buildInfo(tenant, session);
    } catch (err) {
      this.logger.warn(`getConnection tenant ${tenantId}: ${errMsg(err)}`);
      // Sem contato com o gateway: devolve o último estado conhecido, marcado como erro.
      const info = this.buildInfo(tenant, null);
      return { ...info, state: 'error', lastError: errMsg(err) };
    }
  }

  /** Inicia a sessão (dispara a geração do QR) e registra o webhook (best-effort). */
  async connect(tenantId: string): Promise<ConnectionInfo> {
    if (!this.configured) return this.notConfigured();
    const tenant = await this.loadTenant(tenantId);
    const session = await this.ensureSession(tenant);

    if (session.status !== 'ready') {
      try {
        const started = await this.client.startSession(session.id);
        await this.persist(tenant.id, started);
        void this.ensureWebhook(tenantId, session.id);
        return this.buildInfo(tenant, started);
      } catch (err) {
        // 400 = "já iniciada" → segue com o status corrente
        if (!(err instanceof OpenWaError) || err.status !== 400) throw err;
      }
    }
    void this.ensureWebhook(tenantId, session.id);
    return this.buildInfo(tenant, session);
  }

  /** QR de pareamento. Se já conectada, retorna connected sem QR. */
  async getQr(tenantId: string): Promise<QrInfo> {
    if (!this.configured) {
      return { state: 'disconnected', rawStatus: null, connected: false, qrCode: null };
    }
    const tenant = await this.loadTenant(tenantId);
    const session = await this.ensureSession(tenant);

    if (session.status === 'ready') {
      return { state: 'connected', rawStatus: 'ready', connected: true, qrCode: null };
    }

    try {
      const qr = await this.client.getQrCode(session.id);
      await this.tenantRepo.update(tenant.id, { whatsappStatus: qr.status });
      return {
        state: toState(qr.status),
        rawStatus: qr.status,
        connected: qr.status === 'ready',
        qrCode: qr.qrCode ?? null,
      };
    } catch (err) {
      // 400 = QR ainda não pronto (sessão inicializando) → devolve o estado sem QR, sem erro duro.
      if (err instanceof OpenWaError && err.status === 400) {
        return { state: toState(session.status), rawStatus: session.status, connected: false, qrCode: null };
      }
      throw err;
    }
  }

  /** Desconecta (para a sessão). A instância continua existindo para reconectar depois. */
  async disconnect(tenantId: string): Promise<ConnectionInfo> {
    if (!this.configured) return this.notConfigured();
    const tenant = await this.loadTenant(tenantId);
    if (!tenant.whatsappSessionId) return this.buildInfo(tenant, null);
    try {
      const stopped = await this.client.stopSession(tenant.whatsappSessionId);
      await this.persist(tenant.id, stopped);
      return this.buildInfo(tenant, stopped);
    } catch (err) {
      if (err instanceof OpenWaError && err.status === 404) return this.buildInfo(tenant, null);
      throw err;
    }
  }

  /** Reinicia a sessão para gerar um novo QR (quando o anterior expirou). */
  async restart(tenantId: string): Promise<ConnectionInfo> {
    if (!this.configured) return this.notConfigured();
    const tenant = await this.loadTenant(tenantId);
    const session = await this.ensureSession(tenant);
    try {
      await this.client.stopSession(session.id);
    } catch {
      // ignora: pode já estar parada
    }
    const started = await this.client.startSession(session.id);
    await this.persist(tenant.id, started);
    void this.ensureWebhook(tenantId, session.id);
    return this.buildInfo(tenant, started);
  }

  /**
   * Registra (idempotente) o nosso webhook na sessão, sem apagar webhooks de terceiros.
   * Best-effort: exige base pública alcançável (OPENWA_WEBHOOK_BASE_URL / WEBHOOK_BASE_URL).
   */
  private async ensureWebhook(tenantId: string, sessionId: string): Promise<void> {
    const base = (
      this.config.get<string>('OPENWA_WEBHOOK_BASE_URL') ||
      this.config.get<string>('WEBHOOK_BASE_URL') ||
      ''
    ).replace(/\/+$/, '');
    if (!base) return;
    const url = `${base}/api/webhooks/openwa/${tenantId}`;
    try {
      const existing = await this.client.listWebhooks(sessionId);
      if (existing.some((w) => w.url === url)) return;
      await this.client.createWebhook(sessionId, url);
      this.logger.log(`Webhook OpenWA registrado p/ sessão ${sessionId} → ${url}`);
    } catch (err) {
      this.logger.warn(`Falha ao registrar webhook OpenWA (sessão ${sessionId}): ${errMsg(err)}`);
    }
  }

  /**
   * Envia uma mensagem de texto pelo número do condomínio.
   * Lança OpenWaNotConnectedError se a sessão não existir ou não estiver conectada
   * (o dispatcher trata como retriável → falha após as tentativas).
   */
  async sendText(tenantId: string, phone: string, text: string): Promise<{ messageId: string }> {
    if (!this.configured) {
      throw new OpenWaNotConnectedError('Integração OpenWA não configurada no servidor');
    }
    const tenant = await this.loadTenant(tenantId);
    if (!tenant.whatsappSessionId) {
      throw new OpenWaNotConnectedError('Condomínio ainda não tem instância de WhatsApp');
    }

    let session: OpenWaSession;
    try {
      session = await this.client.getSession(tenant.whatsappSessionId);
    } catch (err) {
      if (err instanceof OpenWaError && err.status === 404) {
        throw new OpenWaNotConnectedError('Instância de WhatsApp não encontrada no gateway');
      }
      throw err;
    }

    await this.tenantRepo.update(tenant.id, { whatsappStatus: session.status });
    if (session.status !== 'ready') {
      throw new OpenWaNotConnectedError(
        `WhatsApp do condomínio não está conectado (status: ${session.status})`,
      );
    }

    const res = await this.client.sendText(session.id, toChatId(phone), text);
    return { messageId: res.messageId };
  }

  /** Config de disparo/template do condomínio (para o síndico ver/editar o próprio). */
  async getWhatsappConfig(tenantId: string): Promise<WhatsappTenantConfig> {
    const tenant = await this.loadTenant(tenantId);
    const cfg = { ...DEFAULT_TENANT_CONFIG, ...(tenant.configJson ?? {}) } as typeof DEFAULT_TENANT_CONFIG;
    return {
      templateEncomenda: cfg.whatsappTemplateEncomenda || '',
      templatePadrao: DEFAULT_TEMPLATE_ENCOMENDA,
      variaveis: VARIAVEIS_ENCOMENDA,
      intervaloSegundos: cfg.whatsappIntervaloSegundos,
      jitterSegundos: cfg.whatsappJitterSegundos,
      limiteDiario: cfg.whatsappLimiteDiario,
      horarioEnvioInicio: cfg.horarioEnvioInicio,
      horarioEnvioFim: cfg.horarioEnvioFim,
    };
  }

  /** Salva o template de encomenda personalizado do condomínio (vazio = volta ao padrão). */
  async updateTemplateEncomenda(tenantId: string, template: string): Promise<WhatsappTenantConfig> {
    const tenant = await this.loadTenant(tenantId);
    tenant.configJson = { ...(tenant.configJson ?? {}), whatsappTemplateEncomenda: template };
    await this.tenantRepo.save(tenant);
    return this.getWhatsappConfig(tenantId);
  }

  /** Aplica um status vindo do webhook do gateway (best-effort, chamado pelo controller público). */
  async applyWebhookStatus(
    tenantId: string,
    status: OpenWaSessionStatus,
    phone?: string | null,
    pushName?: string | null,
  ): Promise<void> {
    const patch: TenantWhatsappPatch = { whatsappStatus: status };
    if (phone) patch.whatsappNumero = phone;
    void pushName; // pushName não é persistido em coluna; disponível no status ao vivo
    await this.tenantRepo.update(tenantId, patch);
  }
}
