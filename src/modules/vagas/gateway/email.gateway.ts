import { Injectable, Logger } from '@nestjs/common';

/**
 * Envio de e-mail — MAPEADO, NÃO IMPLEMENTADO.
 *
 * O projeto não tem provedor de e-mail (só Twilio/OpenWA para WhatsApp). A
 * interface existe para que o serviço de cobrança já fale nos dois canais.
 *
 * Ao implementar, atenção a um detalhe do schema: `notificacoes.destinatario_telefone`
 * é NOT NULL, então uma notificação só-e-mail não cabe na tabela como está —
 * vai precisar de migration tornando a coluna anulável e adicionando o canal.
 * Por isso o envio por e-mail hoje é registrado direto em
 * `vagas_cobrancas.enviada_email_at`, sem passar pela fila de notificações.
 */
export interface EnviarEmailParams {
  para: string;
  assunto: string;
  texto: string;
}

export interface EmailGateway {
  readonly disponivel: boolean;
  enviar(params: EnviarEmailParams): Promise<void>;
}

export const EMAIL_GATEWAY = Symbol('EMAIL_GATEWAY');

/** Só registra no log — nenhuma mensagem sai daqui. */
@Injectable()
export class NoopEmailAdapter implements EmailGateway {
  private readonly logger = new Logger(NoopEmailAdapter.name);

  readonly disponivel = false;

  async enviar(params: EnviarEmailParams): Promise<void> {
    this.logger.warn(
      `E-mail NÃO enviado (sem provedor configurado) — para: ${params.para} | assunto: ${params.assunto}`,
    );
  }
}
