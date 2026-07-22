import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export function Vagas() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader 
        title="Gestão de Vagas" 
        description="Gerencie as vagas de garagem e as locações avulsas."
      />
      
      <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground min-h-[400px]">
        <Construction className="h-16 w-16 mb-4 text-primary" />
        <h3 className="text-xl font-semibold text-foreground mb-2">Em Construção</h3>
        <p>A tela de Gestão de Vagas está sendo desenvolvida.</p>
      </Card>
    </div>
  );
}
