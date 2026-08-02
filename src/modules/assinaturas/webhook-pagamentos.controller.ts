import { Body, Controller, ForbiddenException, Headers, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/decorators';
import { WebhookPagamentoService } from './webhook-pagamento.service';

/** Onde o token pode vir. O primeiro que existir é o conferido. */
const CABECALHOS_TOKEN = ['x-webhook-token', 'asaas-access-token', 'x-api-key'];

/**
 * Recebe os eventos de pagamento repassados pelo gateway.
 *
 * `@Public()` porque quem chama é outro sistema, sem JWT nosso — mesmo desenho
 * do webhook do OpenWA. O que substitui a autenticação é o
 * `PAYMENT_WEBHOOK_TOKEN`, o mesmo segredo cadastrado no painel deles.
 *
 * **Responde 200 depressa.** Webhook que processa em linha é webhook que o
 * remetente considera falho por timeout — e reenvia, multiplicando o trabalho
 * justamente quando o sistema está lento. O que garante o tempo aqui é a
 * gravação do evento vir antes de qualquer regra.
 *
 * ### Por que ele mora em Assinaturas, e não em Pagamentos
 *
 * O plano o colocava em `pagamentos/`, junto do resto da integração. Só que
 * Assinaturas **já importa** Pagamentos (para falar com a API), então um
 * controller lá que precisasse do serviço de fatura fecharia um ciclo entre os
 * dois módulos — que só se resolve com `forwardRef`, e ciclo resolvido por
 * `forwardRef` é ciclo que continua existindo.
 *
 * O que importava daquela decisão foi preservado: **o conhecimento do formato
 * do gateway continua em Pagamentos** (`webhook-payload.ts`). Aqui ficaram só a
 * conferência do token e a delegação — quarenta linhas que não sabem o que é um
 * `ChargeStatus`.
 */
@Public()
@Controller('webhooks/pagamentos')
export class WebhookPagamentosController {
  private readonly logger = new Logger(WebhookPagamentosController.name);
  private readonly token: string;

  constructor(
    private readonly webhook: WebhookPagamentoService,
    config: ConfigService,
  ) {
    this.token = config.get<string>('PAYMENT_WEBHOOK_TOKEN') ?? '';
  }

  @Post()
  async receber(
    @Body() corpo: unknown,
    @Headers() cabecalhos: Record<string, string | undefined>,
  ) {
    this.conferirToken(cabecalhos);

    const resultado = await this.webhook.receber(corpo);

    // Mesmo o corpo ilegível responde 200: devolver erro faria o remetente
    // reenviar para sempre um evento que nenhuma repetição conserta. Ele já
    // ficou gravado para ser investigado.
    if (!resultado.aceito) {
      this.logger.warn(`Evento de pagamento ilegível: ${resultado.motivo}`);
    }
    return { ok: true, duplicado: resultado.duplicado ?? false };
  }

  /**
   * Confere o segredo combinado.
   *
   * Sem `PAYMENT_WEBHOOK_TOKEN` configurado a rota **recusa tudo**, em vez de
   * aceitar tudo: um endpoint público que altera estado de fatura não pode ficar
   * aberto porque alguém esqueceu de preencher uma variável de ambiente.
   *
   * A comparação é `timingSafeEqual` — a diferença de tempo entre "errou no
   * primeiro caractere" e "errou no último" é o que permite descobrir um segredo
   * por tentativa.
   */
  private conferirToken(cabecalhos: Record<string, string | undefined>): void {
    if (!this.token) {
      throw new ForbiddenException('Webhook de pagamento não configurado');
    }

    const recebido = CABECALHOS_TOKEN.map((c) => cabecalhos[c]).find(Boolean) ?? '';
    const esperado = Buffer.from(this.token);
    const veio = Buffer.from(recebido);

    if (veio.length !== esperado.length || !timingSafeEqual(veio, esperado)) {
      throw new ForbiddenException('Token do webhook inválido');
    }
  }
}
