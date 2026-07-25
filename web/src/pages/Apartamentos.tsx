import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ApartamentosManager } from '../components/ApartamentosManager';
import { useAuthMe, useModuleEnabled } from '@/hooks/use-tenant-config';

export function Apartamentos() {
  const { data: usuario } = useAuthMe();
  const vagasAtivo = useModuleEnabled('vagas');

  // Vaga da unidade só aparece para quem gerencia vagas no módulo Vagas — o
  // porteiro cadastra a unidade, mas não as vagas dela.
  const permiteVagas =
    vagasAtivo === true && (usuario?.role === 'sindico' || usuario?.role === 'admin');

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        icon={Building2}
        eyebrow="Condomínio"
        title="Apartamentos"
        description="Unidades do condomínio e as vagas que pertencem a elas."
      />
      <ApartamentosManager basePath="" permiteVagas={permiteVagas} />
    </div>
  );
}
