import { WhatsappConnectionCard } from '@/components/WhatsappConnectionCard';
import { WhatsappEnvioCard } from '@/components/WhatsappEnvioCard';

/**
 * O WhatsApp de um condomínio: conexão e ritmo de envio.
 *
 * **Os textos das mensagens não aparecem aqui** — não são configuráveis. São as
 * cinco versões de `notificacoes/message-template.ts`, sorteadas a cada envio,
 * e mudá-las é mudar o código.
 *
 * É a mesma pilha de cards da tela `/whatsapp` do síndico — só muda o
 * `basePath`, que decide se as rotas são as do condomínio da sessão (`''`) ou
 * as da plataforma (`/admin/tenants/:id`). Existe como peça própria para as
 * três telas que mostram isso não saírem do passo quando um card novo entrar.
 */
export function WhatsappCondominioPanel({ basePath = '' }: { basePath?: string }) {
  return (
    <div className="space-y-6">
      <WhatsappConnectionCard basePath={basePath} />
      <WhatsappEnvioCard basePath={basePath} />
    </div>
  );
}
