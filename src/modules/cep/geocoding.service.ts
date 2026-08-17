import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeoPrecisao } from '../../database/entities/tenant.entity';
import { CepService } from './cep.service';

/** O endereço do jeito que a geocodificação precisa ler. */
export interface EnderecoParaGeocodificar {
  cep?: string | null;
  /** Logradouro, sem número. */
  endereco?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export interface Coordenada {
  latitude: number;
  longitude: number;
  precisao: GeoPrecisao;
}

interface RespostaNominatim {
  lat?: string;
  lon?: string;
}

/**
 * De endereço para coordenada, tentando em ordem de precisão.
 *
 * A cadeia existe porque **nenhum provedor sozinho cobre o Brasil**:
 *
 * | # | Fonte | Precisão | Quando falha |
 * |---|---|---|---|
 * | 1 | Nominatim, rua + número + cidade + UF | `endereco` | Rua nova, ou nome grafado diferente do OSM |
 * | 2 | BrasilAPI, coordenada do CEP | `cep` | CEP sem coordenada na base (comum) |
 * | 3 | Nominatim, cidade + UF | `cidade` | Praticamente nunca |
 *
 * **A ordem não é a da qualidade do provedor, é a da precisão do resultado.** A
 * BrasilAPI é mais confiável que o OSM como fonte, mas a coordenada dela é do
 * CEP — ela acerta a rua e ignora o número. Um condomínio numa avenida de 4 km
 * ficaria com o alfinete em qualquer ponto dela.
 *
 * O passo 3 é deliberadamente ruim e existe assim mesmo: um alfinete no centro
 * do município, **marcado como tal**, é melhor que um buraco no mapa. É por isso
 * que `precisao` acompanha a coordenada em vez de ser descartada.
 *
 * ## Nominatim: as regras de uso não são opcionais
 *
 * O serviço é gratuito e mantido por doação. A política pede User-Agent que
 * identifique a aplicação e **no máximo 1 requisição por segundo**. As duas
 * coisas estão implementadas aqui — a segunda como um intervalo mínimo entre
 * chamadas, e não como confiança em quem chama. Ignorar isso é como se toma um
 * bloqueio por IP que derruba a geocodificação de todos os condomínios de uma
 * vez.
 *
 * `NOMINATIM_BASE_URL` vazio desliga os passos 1 e 3, mesma disciplina do
 * `OPENWA_BASE_URL`: sobra a coordenada do CEP, e o resto fica sem coordenada.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  /** Instante da última chamada ao Nominatim, para respeitar o 1 req/s. */
  private ultimaChamada = 0;
  private static readonly INTERVALO_MIN_MS = 1100;

  constructor(
    private readonly config: ConfigService,
    private readonly cep: CepService,
  ) {
    this.baseUrl = (this.config.get<string>('NOMINATIM_BASE_URL') ?? '').replace(/\/+$/, '');
    this.userAgent =
      this.config.get<string>('GEOCODING_USER_AGENT') || 'Chegou/1.0 (+https://chegou.bellory.com.br)';
    this.timeoutMs = this.config.get<number>('GEOCODING_TIMEOUT_MS') ?? 8000;
  }

  get ligado(): boolean {
    return !!this.baseUrl;
  }

  /**
   * A melhor coordenada que este endereço permite, ou `null`.
   *
   * `null` é desfecho normal, não erro: endereço incompleto, provedor fora do
   * ar, lugar que o OSM não conhece. Quem chama grava `NULL` e segue — o mapa
   * mostra os que deram certo.
   */
  async resolver(endereco: EnderecoParaGeocodificar): Promise<Coordenada | null> {
    return (
      (await this.porEnderecoCompleto(endereco)) ??
      (await this.porCep(endereco)) ??
      (await this.porCidade(endereco))
    );
  }

  // ------------------------------------------------------------------ passos

  private async porEnderecoCompleto(e: EnderecoParaGeocodificar): Promise<Coordenada | null> {
    if (!this.ligado || !e.endereco || !e.cidade || !e.estado) return null;

    // A busca estruturada (`street`, `city`, `state`) acerta muito mais que um
    // `q=` com tudo concatenado: o Nominatim não precisa adivinhar onde termina
    // a rua e começa o bairro.
    const params = new URLSearchParams({
      street: e.numero ? `${e.numero} ${e.endereco}` : e.endereco,
      city: e.cidade,
      state: e.estado,
      country: 'Brasil',
      format: 'jsonv2',
      limit: '1',
    });
    if (e.cep) params.set('postalcode', e.cep);

    const achado = await this.nominatim(params);
    return achado ? { ...achado, precisao: 'endereco' } : null;
  }

  private async porCep(e: EnderecoParaGeocodificar): Promise<Coordenada | null> {
    if (!e.cep) return null;
    try {
      // Reaproveita o cache do `CepService` — no fluxo normal o CEP acabou de
      // ser consultado pela tela, então isto não custa rede nenhuma.
      const dados = await this.cep.consultar(e.cep);
      if (dados.latitude == null || dados.longitude == null) return null;
      return { latitude: dados.latitude, longitude: dados.longitude, precisao: 'cep' };
    } catch {
      // CEP não encontrado — o passo seguinte ainda pode salvar pela cidade.
      return null;
    }
  }

  private async porCidade(e: EnderecoParaGeocodificar): Promise<Coordenada | null> {
    if (!this.ligado || !e.cidade || !e.estado) return null;

    const params = new URLSearchParams({
      city: e.cidade,
      state: e.estado,
      country: 'Brasil',
      format: 'jsonv2',
      limit: '1',
    });

    const achado = await this.nominatim(params);
    return achado ? { ...achado, precisao: 'cidade' } : null;
  }

  // ------------------------------------------------------------------- rede

  private async nominatim(
    params: URLSearchParams,
  ): Promise<{ latitude: number; longitude: number } | null> {
    await this.esperarAVez();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resposta = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
        signal: controller.signal,
        // Identificar a aplicação é exigência da política de uso, não cortesia.
        headers: { 'User-Agent': this.userAgent, 'Accept-Language': 'pt-BR' },
      });
      if (!resposta.ok) return null;

      const lista = (await resposta.json()) as RespostaNominatim[];
      const primeiro = Array.isArray(lista) ? lista[0] : null;
      if (!primeiro) return null;

      const latitude = Number(primeiro.lat);
      const longitude = Number(primeiro.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

      return { latitude, longitude };
    } catch (err) {
      this.logger.warn(`Geocodificação falhou: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Segura a chamada até completar o intervalo mínimo desde a anterior.
   *
   * O worker já processa um job por vez, mas um endereço pode gastar **duas**
   * chamadas (endereço e depois cidade) — e nada impede que uma versão futura
   * suba a concorrência. O limite mora aqui porque é aqui que ele é conhecido.
   */
  private async esperarAVez(): Promise<void> {
    const desdeAUltima = Date.now() - this.ultimaChamada;
    const falta = GeocodingService.INTERVALO_MIN_MS - desdeAUltima;
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    this.ultimaChamada = Date.now();
  }
}
