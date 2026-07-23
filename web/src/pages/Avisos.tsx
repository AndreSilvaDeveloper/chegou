import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Aviso } from '@/api/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Plus, Megaphone } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function Avisos() {
  const avisosQuery = useQuery({
    queryKey: ['avisos'],
    queryFn: () => api.get<Aviso[]>('/avisos'),
  });

  const columns = [
    {
      accessorKey: 'titulo',
      header: 'Título',
      cell: ({ row }: any) => <span className="font-medium">{row.original.titulo}</span>
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }: any) => {
        const type = row.original.tipo;
        let variant: 'default' | 'destructive' | 'outline' | 'secondary' = 'default';
        
        if (type === 'urgente') variant = 'destructive';
        else if (type === 'financeiro') variant = 'secondary';
        else if (type === 'geral') variant = 'outline';

        return <Badge variant={variant} className="capitalize">{type}</Badge>;
      }
    },
    {
      accessorKey: 'destinatario',
      header: 'Público Alvo',
      cell: ({ row }: any) => <span className="capitalize">{row.original.destinatario}</span>
    },
    {
      accessorKey: 'createdAt',
      header: 'Criado em',
      cell: ({ row }: any) => format(new Date(row.original.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    },
    {
      accessorKey: 'enviarWhatsapp',
      header: 'WhatsApp',
      cell: ({ row }: any) => (
        <Badge variant={row.original.enviarWhatsapp ? 'default' : 'secondary'}>
          {row.original.enviarWhatsapp ? 'Sim' : 'Não'}
        </Badge>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="Avisos Gerais" 
        description="Envie comunicados para todos os moradores ou blocos específicos."
      >
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Novo Aviso
        </Button>
      </PageHeader>
      
      {avisosQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : avisosQuery.data?.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground min-h-[300px]">
          <Megaphone className="h-12 w-12 mb-4 text-muted" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Nenhum aviso enviado</h3>
          <p>Crie o seu primeiro aviso para se comunicar com os moradores.</p>
          <Button className="mt-4" variant="outline">Criar Aviso</Button>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable 
              columns={columns} 
              data={avisosQuery.data || []} 
              searchKey="titulo"
              searchPlaceholder="Buscar avisos pelo título..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
