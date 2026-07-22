import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export function Avisos() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader 
        title="Avisos Gerais" 
        description="Envie comunicados para todos os moradores ou blocos específicos."
      />
      
      <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground min-h-[400px]">
        <Construction className="h-16 w-16 mb-4 text-primary" />
        <h3 className="text-xl font-semibold text-foreground mb-2">Em Construção</h3>
        <p>A tela de Avisos Gerais está sendo desenvolvida.</p>
      </Card>
    </div>
  );
}
