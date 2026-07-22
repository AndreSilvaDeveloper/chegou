import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Vaga, VagaLocacao } from '@/api/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Plus, Car, Bike } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

export function Vagas() {
  const [activeTab, setActiveTab] = useState('vagas');

  const vagasQuery = useQuery({
    queryKey: ['vagas'],
    queryFn: () => api.get<Vaga[]>('/vagas'),
  });

  const locacoesQuery = useQuery({
    queryKey: ['vagas-locacao'],
    queryFn: () => api.get<VagaLocacao[]>('/vagas-locacao'),
  });

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'carro': return <Car className="h-5 w-5" />;
      case 'moto': return <Bike className="h-5 w-5" />;
      default: return <Car className="h-5 w-5" />;
    }
  };

  const locacoesColumns = [
    {
      accessorKey: 'vaga.numero',
      header: 'Vaga',
    },
    {
      accessorKey: 'morador.nome',
      header: 'Locatário',
      cell: ({ row }: any) => {
        return row.original.morador ? row.original.morador.nome : 'Sem morador';
      }
    },
    {
      accessorKey: 'valorMensal',
      header: 'Valor Mensal',
      cell: ({ row }: any) => `R$ ${Number(row.original.valorMensal).toFixed(2).replace('.', ',')}`
    },
    {
      accessorKey: 'diaVencimento',
      header: 'Vencimento',
      cell: ({ row }: any) => `Dia ${row.original.diaVencimento}`
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => {
        const status = row.original.status;
        let variant: 'default' | 'destructive' | 'outline' | 'secondary' = 'default';
        
        if (status === 'ativa') variant = 'default';
        else if (status === 'encerrada') variant = 'secondary';
        else if (status === 'inadimplente') variant = 'destructive';

        return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
      }
    }
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader 
        title="Gestão de Vagas" 
        description="Gerencie as vagas de garagem e as locações avulsas."
      >
        <div className="flex space-x-2">
          {activeTab === 'vagas' ? (
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova Vaga
            </Button>
          ) : (
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova Locação
            </Button>
          )}
        </div>
      </PageHeader>
      
      <Tabs defaultValue="vagas" onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="vagas">Vagas ({vagasQuery.data?.length || 0})</TabsTrigger>
          <TabsTrigger value="locacoes">Locações Ativas ({locacoesQuery.data?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="vagas" className="space-y-4">
          {vagasQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : vagasQuery.data?.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground min-h-[300px]">
              <Car className="h-12 w-12 mb-4 text-muted" />
              <p>Nenhuma vaga cadastrada neste condomínio.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {vagasQuery.data?.map(vaga => (
                <Card key={vaga.id} className="overflow-hidden">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xl font-bold flex items-center space-x-2">
                      <div className="bg-primary/10 p-2 rounded-full text-primary">
                        {getTipoIcon(vaga.tipo)}
                      </div>
                      <span>Vaga {vaga.numero}</span>
                    </CardTitle>
                    <Badge variant={vaga.ativo ? 'outline' : 'secondary'}>
                      {vaga.ativo ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground mt-2 space-y-1">
                      <p><span className="font-medium text-foreground">Localização:</span> {vaga.localizacao || 'Não informada'}</p>
                      <p><span className="font-medium text-foreground">Apartamento:</span> {vaga.apartamento ? `${vaga.apartamento.bloco ? vaga.apartamento.bloco + '-' : ''}${vaga.apartamento.numero}` : 'Vaga solta / Locação'}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="locacoes" className="space-y-4">
          {locacoesQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <DataTable 
                  columns={locacoesColumns} 
                  data={locacoesQuery.data || []} 
                  searchKey="morador.nome"
                  searchPlaceholder="Buscar por locatário..."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
