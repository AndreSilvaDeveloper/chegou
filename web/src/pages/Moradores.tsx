import { PageHeader } from '@/components/ui/page-header';
import { MoradoresManager } from '../components/MoradoresManager';

export function Moradores() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader 
        title="Moradores" 
        description="Gerencie os contatos dos condôminos que receberão as notificações."
      />
      <MoradoresManager basePath="" />
    </div>
  );
}
