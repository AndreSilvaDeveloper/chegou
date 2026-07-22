import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationThrottleService {
  private readonly logger = new Logger(NotificationThrottleService.name);
  
  // Exemplo de delay aleatório configurável para o envio no WhatsApp (padrão 8 a 30 seg)
  private minDelay = 8000;
  private maxDelay = 30000;

  constructor(private config: ConfigService) {
    const minConfig = this.config.get<number>('WHATSAPP_MIN_DELAY_MS');
    if (minConfig) this.minDelay = minConfig;

    const maxConfig = this.config.get<number>('WHATSAPP_MAX_DELAY_MS');
    if (maxConfig) this.maxDelay = maxConfig;
  }

  async waitForNextSlot(): Promise<void> {
    const delay = Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1)) + this.minDelay;
    
    this.logger.debug(`Aplicando delay anti-bloqueio de ${delay}ms`);
    
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async handleRateLimitError(error: any): Promise<void> {
    this.logger.warn(`Rate limit detectado, aumentando delay e esperando...`, error);
    // Em caso de rate limit, forçamos um delay maior (ex: 60s)
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}
