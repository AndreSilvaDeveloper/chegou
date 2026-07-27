import { PageHeader } from '@/components/ui/page-header';
import { WhatsappConnectionCard } from '@/components/WhatsappConnectionCard';
import { WhatsappEnvioCard } from '@/components/WhatsappEnvioCard';
import { WhatsappTemplateCard } from '@/components/WhatsappTemplateCard';

export function Whatsapp() {
  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="WhatsApp"
        description="Conecte o número do condomínio e personalize as mensagens enviadas aos moradores."
      />

      <WhatsappConnectionCard />

      <WhatsappTemplateCard />

      <WhatsappEnvioCard />
    </div>
  );
}
