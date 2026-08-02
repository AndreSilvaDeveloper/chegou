import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import type { LoginResponse } from './payment-api.types';

/**
 * Erro tipado da Payment API — carrega o HTTP status para o chamador decidir.
 *
 * `status: 0` é falha de rede ou timeout: não sabemos se o outro lado executou.
 * É essa diferença que separa "pode tentar de novo" de "não adianta insistir",
 * e é por isso que o status sobe até quem chamou em vez de virar mensagem.
 */
export class PaymentApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PaymentApiError';
  }

  /** Erro de rede, timeout ou 5xx: o mesmo pedido pode dar certo daqui a pouco. */
  get transitorio(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** Chaves do par de tokens no Redis, compartilhadas por todas as réplicas. */
const CHAVE_TOKENS = 'pay:tokens';
const CHAVE_TRAVA_AUTH = 'pay:auth:lock';

/**
 * Margem para renovar antes de expirar. O access vale 24h; renovar com 1h de
 * folga evita a corrida entre "o token ainda vale" e a chamada chegar lá
 * expirada por causa da latência ou de um relógio ligeiramente adiantado.
 */
const MARGEM_RENOVACAO_MS = 60 * 60 * 1000;

/** Tentativas de uma chamada que falhou de forma transitória (a 1ª + 2 retries). */
const MAX_TENTATIVAS = 3;
const BACKOFF_BASE_MS = 300;

/** Disjuntor: 5 falhas seguidas abrem o circuito por 60s. */
const FALHAS_PARA_ABRIR = 5;
const CIRCUITO_ABERTO_MS = 60_000;

interface TokensGuardados {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms em que o access token expira, já calculado. */
  expiraEm: number;
}

interface OpcoesReq {
  body?: unknown;
  /** `Idempotency-Key` dos POSTs que criam dinheiro. Ver `CobrancasService` (fase 3). */
  idempotencyKey?: string;
  /** Uso interno: impede que o retry pós-401 vire laço. */
  jaRenovou?: boolean;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Cliente HTTP da Payment API: autenticação, retry e idempotência.
 *
 * **Não conhece regra de assinatura.** Ele fala HTTP; quem sabe o que é uma
 * fatura, um sacado ou um preço é o módulo Assinaturas.
 *
 * Três coisas que não são detalhe de implementação:
 *
 * 1. **Vazio desliga.** Sem `PAYMENT_API_BASE_URL`, `configured` é `false` e
 *    ninguém tenta chamar nada — a mesma disciplina do OpenWA. Dev e teste
 *    rodam sem gateway.
 * 2. **O par de tokens vive no Redis**, não em memória: com mais de uma réplica,
 *    cada uma logando por conta própria multiplicaria sessões, e o refresh
 *    **rotaciona** (devolve um par novo, invalidando o anterior) — duas réplicas
 *    renovando ao mesmo tempo derrubariam uma à outra. Daí a trava.
 * 3. **Login é a rede de segurança do refresh.** Temos as credenciais em env,
 *    então refresh que falha nunca é beco sem saída: cai para um login novo. É o
 *    que impede um refresh perdido numa corrida de virar integração fora do ar
 *    até alguém reiniciar o processo.
 */
@Injectable()
export class PaymentApiClient {
  private readonly logger = new Logger(PaymentApiClient.name);
  private readonly baseUrl: string;
  private readonly companyId: string;
  private readonly email: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  /** Estado do disjuntor, por processo — é o processo que está sofrendo. */
  private falhasSeguidas = 0;
  private circuitoAbertoAte = 0;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.baseUrl = (this.config.get<string>('PAYMENT_API_BASE_URL') ?? '').replace(/\/+$/, '');
    this.companyId = this.config.get<string>('PAYMENT_API_COMPANY_ID') ?? '';
    this.email = this.config.get<string>('PAYMENT_API_EMAIL') ?? '';
    this.password = this.config.get<string>('PAYMENT_API_PASSWORD') ?? '';
    this.timeoutMs = this.config.get<number>('PAYMENT_API_TIMEOUT_MS', 15_000);
  }

  /** true quando dá para conversar com o gateway (URL, company e credenciais). */
  get configured(): boolean {
    return Boolean(this.baseUrl && this.companyId && this.email && this.password);
  }

  // ------------------------------------------------------------------ chamadas

  get<T>(path: string): Promise<T> {
    return this.req<T>('GET', path);
  }

  post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    return this.req<T>('POST', path, { body, idempotencyKey });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.req<T>('PUT', path, { body });
  }

  delete<T>(path: string): Promise<T> {
    return this.req<T>('DELETE', path);
  }

  /**
   * Uma chamada autenticada, com retry do que é transitório.
   *
   * O que **não** tem retry: 400, 401, 403, 404, 409, 422. Payload errado não
   * melhora com insistência, e 409 de idempotência é a resposta certa de um
   * retry que deu certo — quem trata é o chamador.
   */
  private async req<T>(method: string, path: string, opcoes: OpcoesReq = {}): Promise<T> {
    if (!this.configured) {
      throw new PaymentApiError(
        0,
        'Cobrança desligada: defina PAYMENT_API_BASE_URL, PAYMENT_API_COMPANY_ID e as credenciais',
      );
    }
    this.conferirCircuito();

    let ultimoErro: PaymentApiError | undefined;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const resposta = await this.chamar<T>(method, path, opcoes);
        this.registrarSucesso();
        return resposta;
      } catch (err) {
        const erro = err as PaymentApiError;

        // 401 depois de um token que julgávamos bom: renova UMA vez e repete.
        // Duas seria laço — 401 com token recém-emitido é configuração errada
        // (credencial trocada, company sem permissão), e insistir só esconde.
        if (erro.status === 401 && !opcoes.jaRenovou) {
          await this.descartarTokens();
          return this.req<T>(method, path, { ...opcoes, jaRenovou: true });
        }

        if (!erro.transitorio) {
          // 4xx conta para o disjuntor? Não: o gateway está de pé e respondeu.
          // Contar aqui abriria o circuito por causa de um payload nosso errado,
          // e aí um erro de cadastro derrubaria a emissão de todo mundo.
          throw erro;
        }

        ultimoErro = erro;
        this.registrarFalha();

        if (tentativa < MAX_TENTATIVAS) {
          await this.esperar(this.backoff(tentativa));
        }
      }
    }

    throw ultimoErro ?? new PaymentApiError(0, 'Falha desconhecida na Payment API');
  }

  private async chamar<T>(method: string, path: string, opcoes: OpcoesReq): Promise<T> {
    const token = await this.accessToken();

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Company-Id': this.companyId,
          ...(opcoes.idempotencyKey ? { 'Idempotency-Key': opcoes.idempotencyKey } : {}),
          ...(opcoes.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw this.erroDeRede(err, method, path);
    }

    return this.lerResposta<T>(res, method, path);
  }

  private async lerResposta<T>(res: Response, method: string, path: string): Promise<T> {
    const text = await res.text();
    const data = text ? safeJson(text) : null;

    if (!res.ok) {
      const corpo = data as { message?: unknown; error?: unknown } | null;
      const bruto = corpo?.message ?? corpo?.error;
      const msg = Array.isArray(bruto)
        ? bruto.join(', ')
        : (bruto ?? `Payment API HTTP ${res.status} (${method} ${path})`);
      throw new PaymentApiError(res.status, String(msg), data);
    }

    return data as T;
  }

  private erroDeRede(err: unknown, method: string, path: string): PaymentApiError {
    const nome = (err as Error).name;
    if (nome === 'TimeoutError' || nome === 'AbortError') {
      return new PaymentApiError(
        0,
        `Payment API não respondeu em ${this.timeoutMs}ms (${method} ${path})`,
      );
    }
    return new PaymentApiError(0, `Falha de rede na Payment API: ${(err as Error).message}`);
  }

  // ------------------------------------------------------------ autenticação

  /**
   * Access token válido, do Redis ou recém-emitido.
   *
   * A trava serve para o caso concorrente: várias réplicas (ou vários jobs)
   * percebendo o vencimento ao mesmo tempo. Quem não pega a trava espera e relê
   * — normalmente o token já está lá.
   */
  private async accessToken(): Promise<string> {
    const guardados = await this.lerTokens();
    if (guardados && guardados.expiraEm - MARGEM_RENOVACAO_MS > Date.now()) {
      return guardados.accessToken;
    }

    const pegou = await this.redis.set(CHAVE_TRAVA_AUTH, '1', 'PX', 30_000, 'NX');
    if (!pegou) {
      // Alguém já está renovando. Espera curta e relê: o caminho normal é o
      // token novo já estar publicado. Se ainda não estiver, renova junto —
      // pior que uma renovação a mais é uma chamada sem token.
      await this.esperar(300);
      const agora = await this.lerTokens();
      if (agora && agora.expiraEm > Date.now()) return agora.accessToken;
    }

    try {
      const tokens = await this.renovar(guardados);
      return tokens.accessToken;
    } finally {
      if (pegou) await this.redis.del(CHAVE_TRAVA_AUTH).catch(() => undefined);
    }
  }

  /**
   * Renova o par: tenta o refresh e, se ele falhar, faz login.
   *
   * O login não é plano B improvisado — é a garantia de que uma rotação perdida
   * (duas réplicas renovando na mesma janela, refresh já consumido) não deixa a
   * integração fora do ar até alguém reiniciar o processo.
   */
  private async renovar(guardados: TokensGuardados | null): Promise<TokensGuardados> {
    if (guardados?.refreshToken) {
      try {
        return await this.publicar(
          await this.semAutenticacao<LoginResponse>('/auth/refresh', {
            refreshToken: guardados.refreshToken,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Refresh recusado pela Payment API (${(err as Error).message}); fazendo login novo`,
        );
      }
    }

    return this.publicar(
      await this.semAutenticacao<LoginResponse>('/auth/login', {
        email: this.email,
        password: this.password,
      }),
    );
  }

  /** `POST` nos dois endpoints públicos de auth — sem token, sem company. */
  private async semAutenticacao<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw this.erroDeRede(err, 'POST', path);
    }
    return this.lerResposta<T>(res, 'POST', path);
  }

  private async publicar(resposta: LoginResponse): Promise<TokensGuardados> {
    const tokens: TokensGuardados = {
      accessToken: resposta.accessToken,
      refreshToken: resposta.refreshToken,
      // `expiresIn` vem em MILISSEGUNDOS (86400000 = 24h). Tratar como segundos
      // guardaria um token por 24 mil dias e só descobriríamos no primeiro 401.
      expiraEm: Date.now() + resposta.expiresIn,
    };

    // O TTL da chave segue o refresh (7d), não o access: perder o refresh por
    // expiração da chave forçaria login a cada 24h sem necessidade.
    await this.redis.set(CHAVE_TOKENS, JSON.stringify(tokens), 'EX', 7 * 24 * 60 * 60);
    return tokens;
  }

  private async lerTokens(): Promise<TokensGuardados | null> {
    const bruto = await this.redis.get(CHAVE_TOKENS);
    if (!bruto) return null;
    try {
      return JSON.parse(bruto) as TokensGuardados;
    } catch {
      return null;
    }
  }

  private async descartarTokens(): Promise<void> {
    await this.redis.del(CHAVE_TOKENS).catch(() => undefined);
  }

  // ---------------------------------------------------------------- disjuntor

  private conferirCircuito(): void {
    if (this.circuitoAbertoAte > Date.now()) {
      const faltam = Math.ceil((this.circuitoAbertoAte - Date.now()) / 1000);
      throw new PaymentApiError(
        0,
        `Payment API fora do ar (disjuntor aberto, ${faltam}s para nova tentativa)`,
      );
    }
  }

  private registrarSucesso(): void {
    this.falhasSeguidas = 0;
    this.circuitoAbertoAte = 0;
  }

  private registrarFalha(): void {
    this.falhasSeguidas += 1;
    if (this.falhasSeguidas >= FALHAS_PARA_ABRIR) {
      this.circuitoAbertoAte = Date.now() + CIRCUITO_ABERTO_MS;
      this.falhasSeguidas = 0;
      this.logger.error(
        `Payment API: ${FALHAS_PARA_ABRIR} falhas seguidas, pausando chamadas por ${CIRCUITO_ABERTO_MS / 1000}s`,
      );
    }
  }

  // ------------------------------------------------------------------ auxílio

  /** Backoff exponencial com jitter: 300ms, 600ms… ±50%, para não sincronizar retries. */
  private backoff(tentativa: number): number {
    const base = BACKOFF_BASE_MS * 2 ** (tentativa - 1);
    return Math.round(base * (0.5 + Math.random()));
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
