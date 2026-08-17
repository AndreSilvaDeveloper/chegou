import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** O que a consulta devolve — os campos que a tela preenche sozinha. */
export interface EnderecoPorCep {
  cep: string;
  /** Logradouro (rua/avenida). Vazio nos CEPs de cidade inteira. */
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  /** Sigla de duas letras. */
  estado: string | null;
}

interface RespostaBrasilApi {
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface RespostaViaCep {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

/**
 * Consulta de CEP para preencher o endereço do condomínio.
 *
 * POR QUE PELO BACKEND, E NÃO DIRETO DO NAVEGADOR
 *
 * A consulta feita pelo painel viajaria do dispositivo de quem está cadastrando
 * — e o síndico costuma estar numa rede de condomínio ou corporativa, que é
 * exatamente onde domínio de terceiro é filtrado. Aqui a chamada sai do
 * servidor: falha do jeito igual para todo mundo, dá para cachear e dá para
 * trocar de provedor sem publicar build novo do front.
 *
 * DOIS PROVEDORES, EM ORDEM
 *
 * BrasilAPI primeiro (ela própria consulta várias bases), ViaCEP como reserva.
 * Não é excesso de zelo: os dois são serviços públicos gratuitos, sem contrato
 * de disponibilidade, e um CEP que não responde trava o cadastro inteiro se for
 * o único caminho.
 *
 * **A consulta nunca é obrigatória.** Ela preenche campos; quem valida o
 * endereço é o usuário olhando para a tela. CEP novo demora a entrar nas bases,
 * e recusar o cadastro por causa disso deixaria condomínio de bairro recém-criado
 * sem conseguir se cadastrar. Por isso a única resposta de erro é 404 — a tela
 * segue com os campos abertos para digitação.
 */
@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);
  private readonly timeoutMs: number;

  /**
   * Cache em memória, sem TTL de propósito: CEP não muda de bairro. O limite
   * existe só para o mapa não crescer para sempre num processo de vida longa —
   * na prática um servidor atende dezenas de CEPs distintos, não milhares.
   */
  private readonly cache = new Map<string, EnderecoPorCep>();
  private static readonly CACHE_MAX = 500;

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = this.config.get<number>('CEP_TIMEOUT_MS') ?? 5000;
  }

  async consultar(cepBruto: string): Promise<EnderecoPorCep> {
    const cep = cepBruto.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) throw new NotFoundException('CEP inválido');

    const emCache = this.cache.get(cep);
    if (emCache) return emCache;

    const achado = (await this.brasilApi(cep)) ?? (await this.viaCep(cep));
    if (!achado) throw new NotFoundException('CEP não encontrado');

    // Descarta o mais antigo quando enche — FIFO basta: o custo de um miss é uma
    // chamada HTTP, não vale um LRU de verdade aqui.
    if (this.cache.size >= CepService.CACHE_MAX) {
      const maisAntigo = this.cache.keys().next().value;
      if (maisAntigo) this.cache.delete(maisAntigo);
    }
    this.cache.set(cep, achado);
    return achado;
  }

  /** `fetch` com timeout — provedor lento não pode segurar a request do painel. */
  private async buscar(url: string): Promise<unknown | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resposta = await fetch(url, { signal: controller.signal });
      if (!resposta.ok) return null;
      return (await resposta.json()) as unknown;
    } catch (err) {
      // Provedor fora do ar não é erro nosso: cai para o próximo, e no fim vira
      // 404 — a tela segue aceitando o endereço digitado à mão.
      this.logger.warn(`Consulta de CEP falhou em ${url}: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async brasilApi(cep: string): Promise<EnderecoPorCep | null> {
    const dados = (await this.buscar(`https://brasilapi.com.br/api/cep/v2/${cep}`)) as
      | RespostaBrasilApi
      | null;
    if (!dados?.state) return null;
    return {
      cep,
      endereco: dados.street?.trim() || null,
      bairro: dados.neighborhood?.trim() || null,
      cidade: dados.city?.trim() || null,
      estado: dados.state.trim().toUpperCase().slice(0, 2),
    };
  }

  private async viaCep(cep: string): Promise<EnderecoPorCep | null> {
    const dados = (await this.buscar(`https://viacep.com.br/ws/${cep}/json/`)) as
      | RespostaViaCep
      | null;
    // A ViaCEP responde 200 com `{ "erro": true }` para CEP inexistente — e em
    // algumas versões com a string "true". Checar só o status deixaria passar.
    if (!dados || dados.erro || !dados.uf) return null;
    return {
      cep,
      endereco: dados.logradouro?.trim() || null,
      bairro: dados.bairro?.trim() || null,
      cidade: dados.localidade?.trim() || null,
      estado: dados.uf.trim().toUpperCase().slice(0, 2),
    };
  }
}
