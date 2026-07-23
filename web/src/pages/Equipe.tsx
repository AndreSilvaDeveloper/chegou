import { PageHeader } from '@/components/ui/page-header';
import { EquipeManager } from '../components/EquipeManager';

export function Equipe() {
  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="Equipe" 
        description="Crie e gerencie os acessos de porteiros e síndicos deste condomínio."
      />
      <EquipeManager basePath="" allowedRoles={['porteiro', 'sindico']} />
    </div>
  );
}
