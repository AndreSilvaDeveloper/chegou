import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { Tenant } from '../../database/entities';
import { DEFAULT_TENANT_CONFIG } from '../admin/dto/config-tenant.dto';
import { AtualizarConfigWhatsappPlataformaDto } from './dto/atualizar-config-plataforma.dto';
import {
  AtualizarConfigWhatsappDto,
  INTERVALO_MINIMO_SEGUNDOS,
  JANELA_MAXIMA,
  JANELA_MINIMA,
  LIMITE_DIARIO_MAXIMO,
  LIMITE_DIARIO_MINIMO,
} from './dto/atualizar-config.dto';
import {
  OpenWaClient,
  OpenWaError,
  OpenWaSession,
  OpenWaSessionStatus,
} from './openwa.client';

/**
 * Ritmo de envio de um condomínio.
 *
 * **Sem os textos das mensagens**: eles não são configuráveis. São as cinco
 * versões de `notificacoes/message-template.ts`, sorteadas a cada envio — ver o
 * porquê lá.
 */
export interface WhatsappTenantConfig {
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  /**
   * Faixas que quem está editando pode escolher — a tela mostra e valida por
   * elas, em vez de repetir os números. Elas **mudam com o escopo**: o
   * superadmin não tem as travas anti-bloqueio do condomínio.
   */
  limites: {
    intervaloMinimoSegundos: number;
    janelaMinima: string;
    janelaMaxima: string;
    limiteDiarioMinimo: number;
    limiteDiarioMaximo: number;
  };
  /**
   * O jitter é editável nesta tela? Só na da plataforma: ele é o disfarce da
   * cadência, não uma preferência do condomínio.
   */
  jitterEditavel: boolean;
}

/**
 * Quem está mexendo na config: o próprio condomínio ou a plataforma.
 *
 * A diferença **não é cosmética** — é ela que decide as faixas devolvidas e a
 * validação aplicada no `PATCH`. O condomínio escolhe dentro das regras
 * anti-bloqueio; o superadmin responde pelo número e pode sair delas.
 */
export type EscopoConfigWhatsapp = 'condominio' | 'plataforma';

/** Faixas da plataforma: sem trava, porque quem edita responde pelo número. */
const LIMITES_PLATAFORMA = {
  intervaloMinimoSegundos: 0,
  janelaMinima: '00:00',
  janelaMaxima: '23:59',
  limiteDiarioMinimo: 0,
  limiteDiarioMaximo: 100000,
};

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

/** O número (em nenhuma variação com/sem o 9) está registrado no WhatsApp. Falha terminal. */
export class WhatsappNumberNotFoundError extends Error {
  constructor(public readonly phone: string) {
    super('Número não está no WhatsApp');
    this.name = 'WhatsappNumberNotFoundError';
  }
}

function onlyDigits(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

/**
 * Remove o "nono dígito" de um celular brasileiro (55 + DDD + 9 + 8 → 55 + DDD + 8).
 * Muitos números do WhatsApp no Brasil existem SEM o 9; enviar com o 9 não entrega.
 * Só mexe quando o padrão bate (13 dígitos, começa com 55, parte do assinante começa com 9).
 */
function stripBrazilNinthDigit(digits: string): string {
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const assinante = digits.slice(4); // 9 dígitos: 9XXXXXXXX
    if (assinante.length === 9 && assinante.startsWith('9')) {
      return `55${ddd}${assinante.slice(1)}`;
    }
  }
  return digits;
}

/** Formas candidatas do número (com e sem o 9), sem duplicar. */
function brazilCandidates(digits: string): string[] {
  const semNove = stripBrazilNinthDigit(digits);
  return semNove === digits ? [digits] : [digits, semNove];
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

  /** Status da sessão: curto, só para não perguntar ao gateway a cada mensagem. */
  private static readonly TTL_SESSAO_S = 30;
  /** JID do destinatário: longo, porque o número de um morador não muda. */
  private static readonly TTL_JID_S = 30 * 24 * 3600;

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly client: OpenWaClient,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  get configured(): boolean {
    return this.client.configured;
  }

  /** Status da sessão, cacheado por segundos — vale por envio, não por dia. */
  private sessaoKey(tenantId: string): string {
    return `wa:sess:${tenantId}`;
  }

  /** JID canônico de um número naquele condomínio. Muda praticamente nunca. */
  private jidKey(tenantId: string, digits: string): string {
    return `wa:jid:${tenantId}:${digits}`;
  }

  /** Derruba o status cacheado — chamado sempre que a conexão muda de estado. */
  private async esquecerSessao(tenantId: string): Promise<void> {
    await this.redis.del(this.sessaoKey(tenantId)).catch(() => undefined);
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
    await this.esquecerSessao(tenantId);
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

  /**
   * Provisiona explicitamente a instância de um condomínio (cria/adota a sessão e grava
   * os vínculos no tenant). Diferente do provisionForTenant, PROPAGA erros para a UI.
   */
  async provision(tenantId: string): Promise<ConnectionInfo> {
    if (!this.configured) {
      throw new BadRequestException('Integração OpenWA não configurada no servidor');
    }
    const tenant = await this.loadTenant(tenantId);
    const session = await this.ensureSession(tenant);
    this.logger.log(`Instância OpenWA provisionada (manual) p/ ${tenant.slug}: ${session.name}`);
    return this.buildInfo(tenant, session);
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

    const status = await this.statusParaEnvio(tenant);
    if (status !== 'ready') {
      throw new OpenWaNotConnectedError(
        `WhatsApp do condomínio não está conectado (status: ${status})`,
      );
    }

    const sessionId = tenant.whatsappSessionId;
    const chatId = await this.resolveChatId(tenantId, sessionId, phone);
    try {
      const res = await this.client.sendText(sessionId, chatId, text);
      return { messageId: res.messageId };
    } catch (err) {
      // JID cacheado pode ter envelhecido (número portado, conta apagada).
      // Descarta para a próxima tentativa perguntar de novo ao gateway.
      await this.redis.del(this.jidKey(tenantId, onlyDigits(phone))).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Status da sessão para decidir se dá para enviar.
   *
   * Antes era um `GET /sessions/:id` no gateway **a cada mensagem**, mais um
   * `UPDATE tenants` também a cada mensagem. Com muitos condomínios isso era um
   * terço da latência do envio e uma escrita inútil no banco. Agora o "ready"
   * vale por alguns segundos em cache, e o banco só é tocado quando o status
   * realmente mudou. Sessão que cai invalida o cache pelo webhook — e, no pior
   * caso, o próprio envio falha e o BullMQ reagenda.
   */
  private async statusParaEnvio(tenant: Tenant): Promise<OpenWaSessionStatus> {
    const chave = this.sessaoKey(tenant.id);
    const cacheado = (await this.redis.get(chave).catch(() => null)) as OpenWaSessionStatus | null;
    if (cacheado) return cacheado;

    let session: OpenWaSession;
    try {
      session = await this.client.getSession(tenant.whatsappSessionId as string);
    } catch (err) {
      if (err instanceof OpenWaError && err.status === 404) {
        throw new OpenWaNotConnectedError('Instância de WhatsApp não encontrada no gateway');
      }
      throw err;
    }

    await this.redis
      .set(chave, session.status, 'EX', OpenwaService.TTL_SESSAO_S)
      .catch(() => undefined);
    if (session.status !== tenant.whatsappStatus) {
      await this.tenantRepo.update(tenant.id, { whatsappStatus: session.status });
    }
    return session.status;
  }

  /**
   * Descobre o JID correto do destinatário. Pergunta ao WhatsApp (via `checkNumber`) qual
   * variação — com ou sem o nono dígito — realmente existe, e usa o JID canônico retornado.
   * Se o gateway não resolver, cai no número SEM o 9 (padrão que entrega na maioria dos DDDs).
   *
   * O resultado é cacheado por condomínio + número: o JID de um morador não muda,
   * e essa era a segunda (às vezes terceira) chamada HTTP de todo envio.
   */
  private async resolveChatId(tenantId: string, sessionId: string, phone: string): Promise<string> {
    const digits = onlyDigits(phone);
    const chave = this.jidKey(tenantId, digits);

    const cacheado = await this.redis.get(chave).catch(() => null);
    if (cacheado) return cacheado;

    for (const candidato of brazilCandidates(digits)) {
      let check: { exists: boolean; whatsappId: string | null };
      try {
        check = await this.client.checkNumber(sessionId, candidato);
      } catch (err) {
        // Erro de rede/gateway → não dá pra afirmar que não existe; envia best-effort (sem o 9).
        // Não cacheia: é palpite, não resposta.
        this.logger.warn(`checkNumber falhou p/ ${candidato}: ${errMsg(err)} — usando fallback sem o 9`);
        return `${stripBrazilNinthDigit(digits)}@c.us`;
      }
      if (check.exists && check.whatsappId) {
        // já vem no formato nativo do engine (ex.: 55...@c.us)
        await this.redis
          .set(chave, check.whatsappId, 'EX', OpenwaService.TTL_JID_S)
          .catch(() => undefined);
        return check.whatsappId;
      }
    }
    // Gateway respondeu para todas as variações (com e sem o 9) e nenhuma existe no WhatsApp.
    this.logger.warn(`Número não está no WhatsApp: ${digits} (checado com e sem o 9)`);
    throw new WhatsappNumberNotFoundError(digits);
  }

  /**
   * Config de disparo do condomínio.
   *
   * O `escopo` decide as faixas devolvidas: o síndico recebe as travas
   * anti-bloqueio, a plataforma recebe o campo livre. A tela é a mesma nos dois
   * casos — ela valida pelo que vem daqui.
   */
  async getWhatsappConfig(
    tenantId: string,
    escopo: EscopoConfigWhatsapp = 'condominio',
  ): Promise<WhatsappTenantConfig> {
    const tenant = await this.loadTenant(tenantId);
    const cfg = { ...DEFAULT_TENANT_CONFIG, ...(tenant.configJson ?? {}) } as typeof DEFAULT_TENANT_CONFIG;
    const plataforma = escopo === 'plataforma';
    return {
      intervaloSegundos: cfg.whatsappIntervaloSegundos,
      jitterSegundos: cfg.whatsappJitterSegundos,
      limiteDiario: cfg.whatsappLimiteDiario,
      horarioEnvioInicio: cfg.horarioEnvioInicio,
      horarioEnvioFim: cfg.horarioEnvioFim,
      limites: plataforma
        ? LIMITES_PLATAFORMA
        : {
            intervaloMinimoSegundos: INTERVALO_MINIMO_SEGUNDOS,
            janelaMinima: JANELA_MINIMA,
            janelaMaxima: JANELA_MAXIMA,
            limiteDiarioMinimo: LIMITE_DIARIO_MINIMO,
            limiteDiarioMaximo: LIMITE_DIARIO_MAXIMO,
          },
      jitterEditavel: plataforma,
    };
  }

  /**
   * Salva o que o condomínio pode ajustar sozinho: o ritmo de envio.
   *
   * Campo `undefined` não é tocado — a tela manda só o que mudou, sem apagar o
   * resto sem querer. Os limites de cada campo estão no DTO; aqui fica só a
   * regra que depende dos dois horários juntos.
   */
  async updateWhatsappConfig(
    tenantId: string,
    dto: AtualizarConfigWhatsappDto,
  ): Promise<WhatsappTenantConfig> {
    const tenant = await this.loadTenant(tenantId);
    const configJson = { ...(tenant.configJson ?? {}) };

    if (dto.intervaloSegundos !== undefined) {
      configJson.whatsappIntervaloSegundos = dto.intervaloSegundos;
    }
    if (dto.limiteDiario !== undefined) {
      configJson.whatsappLimiteDiario = dto.limiteDiario;
    }

    if (dto.horarioEnvioInicio !== undefined || dto.horarioEnvioFim !== undefined) {
      const atual = { ...DEFAULT_TENANT_CONFIG, ...configJson } as typeof DEFAULT_TENANT_CONFIG;
      const inicio = dto.horarioEnvioInicio ?? atual.horarioEnvioInicio;
      const fim = dto.horarioEnvioFim ?? atual.horarioEnvioFim;

      // O condomínio escolhe DENTRO da janela permitida — pode estreitar (só de
      // tarde, por exemplo), nunca esticar para a madrugada.
      if (inicio < JANELA_MINIMA || fim > JANELA_MAXIMA) {
        throw new BadRequestException(
          `A janela de envio precisa ficar entre ${JANELA_MINIMA} e ${JANELA_MAXIMA}`,
        );
      }
      if (inicio >= fim) {
        throw new BadRequestException('O horário de início precisa ser antes do de término');
      }

      configJson.horarioEnvioInicio = inicio;
      configJson.horarioEnvioFim = fim;
    }

    tenant.configJson = configJson;
    await this.tenantRepo.save(tenant);
    return this.getWhatsappConfig(tenantId);
  }

  /**
   * A mesma config, salva pela **plataforma**.
   *
   * Não repassa para `updateWhatsappConfig` de propósito: aquela aplica as
   * travas anti-bloqueio do condomínio (piso de 90s, janela 08:00–21:00), e é
   * justamente delas que o superadmin precisa poder sair. O que fica igual é a
   * disciplina do merge: campo `undefined` não é tocado.
   */
  async updateWhatsappConfigPlataforma(
    tenantId: string,
    dto: AtualizarConfigWhatsappPlataformaDto,
  ): Promise<WhatsappTenantConfig> {
    const tenant = await this.loadTenant(tenantId);
    const configJson = { ...(tenant.configJson ?? {}) };

    if (dto.intervaloSegundos !== undefined) configJson.whatsappIntervaloSegundos = dto.intervaloSegundos;
    if (dto.jitterSegundos !== undefined) configJson.whatsappJitterSegundos = dto.jitterSegundos;
    if (dto.limiteDiario !== undefined) configJson.whatsappLimiteDiario = dto.limiteDiario;
    if (dto.horarioEnvioInicio !== undefined) configJson.horarioEnvioInicio = dto.horarioEnvioInicio;
    if (dto.horarioEnvioFim !== undefined) configJson.horarioEnvioFim = dto.horarioEnvioFim;

    // Ordem dos horários vale em qualquer escopo: janela invertida não é uma
    // licença da plataforma, é fila parada — nenhuma mensagem sairia.
    const inicio = (configJson.horarioEnvioInicio ?? DEFAULT_TENANT_CONFIG.horarioEnvioInicio) as string;
    const fim = (configJson.horarioEnvioFim ?? DEFAULT_TENANT_CONFIG.horarioEnvioFim) as string;
    if (inicio >= fim) {
      throw new BadRequestException('O horário de início precisa ser antes do de término');
    }

    tenant.configJson = configJson;
    await this.tenantRepo.save(tenant);
    return this.getWhatsappConfig(tenantId, 'plataforma');
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
    // O webhook é a via mais rápida de saber que a sessão caiu: invalida o cache
    // para o próximo envio ir perguntar ao gateway em vez de confiar no "ready".
    await this.esquecerSessao(tenantId);
  }
}
