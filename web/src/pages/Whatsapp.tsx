import { MessageCircle } from 'lucide-react';
import { PageShell } from '@/components/ui/page-shell';
import { WhatsappConnectionCard } from '@/components/WhatsappConnectionCard';
import { WhatsappEnvioCard } from '@/components/WhatsappEnvioCard';
import { WhatsappTemplateCard } from '@/components/WhatsappTemplateCard';

export function Whatsapp() {
  return (
    <PageShell
      icon={MessageCircle}
      eyebrow="Comunicação"
      title="WhatsApp"
      description="Conecte o número do condomínio e personalize as mensagens enviadas aos moradores."
    >
      <div className="space-y-6">
        <WhatsappConnectionCard />
        <WhatsappTemplateCard />
        <WhatsappEnvioCard />
      </div>
    </PageShell>
  );
}
