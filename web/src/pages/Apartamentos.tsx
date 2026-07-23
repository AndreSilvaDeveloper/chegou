import { PageHeader } from '@/components/ui/page-header';
import { ApartamentosManager } from '../components/ApartamentosManager';

export function Apartamentos() {
  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="Apartamentos" 
        description="Gerencie as unidades e blocos do condomínio."
      />
      <ApartamentosManager basePath="" />
    </div>
  );
}
