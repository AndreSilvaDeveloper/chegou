import { MessageCircle } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { WhatsappConnectionCard } from '@/components/WhatsappConnectionCard';
import { WhatsappEnvioCard } from '@/components/WhatsappEnvioCard';

export function Whatsapp() {
  return (
    <PageShell
      icon={MessageCircle}
      eyebrow="Comunicação"
      title="WhatsApp"
      description="Conecte o número do condomínio e ajuste o ritmo de envio das mensagens aos moradores."
    >
      <div className="space-y-6">
        <WhatsappConnectionCard />
        <WhatsappEnvioCard />
      </div>
    </PageShell>
  );
}
