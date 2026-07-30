import { WhatsappConnectionCard } from '@/components/WhatsappConnectionCard';
import { WhatsappEnvioCard } from '@/components/WhatsappEnvioCard';
import { WhatsappTemplateCard } from '@/components/WhatsappTemplateCard';

/**
 * O WhatsApp de um condomínio: conexão, modelos de mensagem e ritmo de envio.
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
      <WhatsappTemplateCard basePath={basePath} />
      <WhatsappEnvioCard basePath={basePath} />
    </div>
  );
}
