import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinhaOcr } from '../../database/entities';

export interface ResultadoOcr {
  linhas: LinhaOcr[];
  ms: number;
  largura: number;
  altura: number;
}

/**
 * Cliente do serviço de OCR (container `ocr`, ver `ocr/README.md`).
 *
 * Só transporte: quem interpreta o texto é o parser. Se `OCR_BASE_URL` estiver
 * vazio o serviço se declara indisponível e as rotas respondem 503 — a API
 * inteira continua de pé, que é o ponto (o container de OCR é o mais pesado da
 * stack e precisa poder ficar de fora num servidor apertado).
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('OCR_BASE_URL') ?? '').replace(/\/+$/, '');
    this.timeoutMs = config.get<number>('OCR_TIMEOUT_MS', 30000);
    if (!this.isConfigured) {
      this.logger.warn('OCR não configurado — leitura de etiqueta ficará indisponível');
    }
  }

  get isConfigured(): boolean {
    return !!this.baseUrl;
  }

  /** Para a tela dizer "OCR fora do ar" em vez de só falhar no upload. */
  async disponivel(): Promise<boolean> {
    if (!this.isConfigured) return false;
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async ler(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<ResultadoOcr> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Leitura de etiqueta indisponível: serviço de OCR não configurado neste ambiente',
      );
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname || 'etiqueta.jpg',
    );

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/ocr`, {
        method: 'POST',
        body: form,
        // Sem timeout, uma imagem patológica seguraria a request até o proxy
        // desistir — e o porteiro ficaria olhando para o spinner.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.error(`Falha ao falar com o OCR: ${err}`);
      throw new ServiceUnavailableException('Serviço de OCR não respondeu. Tente de novo.');
    }

    if (!res.ok) {
      const corpo = await res.text().catch(() => '');
      this.logger.error(`OCR devolveu ${res.status}: ${corpo.slice(0, 300)}`);
      throw new ServiceUnavailableException('Serviço de OCR falhou ao ler a imagem.');
    }

    return (await res.json()) as ResultadoOcr;
  }
}
