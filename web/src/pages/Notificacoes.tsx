import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Notificacao, StatusNotificacao } from '@/api/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Bell, RefreshCw, XCircle } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { StatCard } from '@/components/ui/stat-card';

export function Notificacoes() {
  const [activeTab, setActiveTab] = useState('todas');
  const queryClient = useQueryClient();

  const getStatusQuery = () => {
    if (activeTab === 'todas') return '';
    return `?status=${activeTab}`;
  };

  const notificacoesQuery = useQuery({
    queryKey: ['notificacoes', activeTab],
    queryFn: () => api.get<{items: Notificacao[], total: number}>(`/notificacoes${getStatusQuery()}`).then(res => res.items),
  });

  const statsQuery = useQuery({
    queryKey: ['notificacoes-stats'],
    queryFn: () => api.get<any>('/notificacoes/stats'),
  });

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notificacoes/${id}/cancelar`),
    onSuccess: () => {
      toast.success('Notificação cancelada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
      queryClient.invalidateQueries({ queryKey: ['notificacoes-stats'] });
    },
    onError: () => toast.error('Falha ao cancelar notificação')
  });

  const reenviarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notificacoes/${id}/reenviar`),
    onSuccess: () => {
      toast.success('Notificação reenviada para a fila!');
      queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
      queryClient.invalidateQueries({ queryKey: ['notificacoes-stats'] });
    },
    onError: () => toast.error('Falha ao reenviar notificação')
  });

  const columns = [
    {
      accessorKey: 'destinatarioNome',
      header: 'Destinatário',
      cell: ({ row }: any) => (
        <div>
          <div className="font-medium">{row.original.destinatarioNome || 'Desconhecido'}</div>
          <div className="text-xs text-muted-foreground">{row.original.destinatarioTelefone}</div>
        </div>
      )
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }: any) => <Badge variant="outline" className="capitalize">{row.original.tipo.replace('_', ' ')}</Badge>
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => {
        const status = row.original.status as StatusNotificacao;
        let variant: 'default' | 'destructive' | 'outline' | 'secondary' = 'default';
        
        if (status === 'pendente' || status === 'agendada' || status === 'enviando') variant = 'secondary';
        else if (status === 'enviada') variant = 'default';
        else if (status === 'falha' || status === 'cancelada') variant = 'destructive';

        return <Badge variant={variant} className="capitalize">{status}</Badge>;
      }
    },
    {
      accessorKey: 'createdAt',
      header: 'Criada em',
      cell: ({ row }: any) => format(new Date(row.original.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }: any) => {
        const notif = row.original as Notificacao;
        if (notif.status === 'pendente' || notif.status === 'agendada') {
          return (
            <Button variant="ghost" size="sm" onClick={() => cancelarMutation.mutate(notif.id)} disabled={cancelarMutation.isPending}>
              <XCircle className="h-4 w-4 mr-1 text-destructive" /> Cancelar
            </Button>
          );
        }
        if (notif.status === 'falha') {
          return (
            <Button variant="ghost" size="sm" onClick={() => reenviarMutation.mutate(notif.id)} disabled={reenviarMutation.isPending}>
              <RefreshCw className="h-4 w-4 mr-1" /> Reenviar
            </Button>
          );
        }
        return null;
      }
    }
  ];

  const stats = statsQuery.data || { total: 0, pendentes: 0, enviadas: 0, falhas: 0, canceladas: 0 };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="Fila de Notificações" 
        description="Acompanhe o status de envio das mensagens no WhatsApp e gerencie a fila."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Na Fila (Pendentes)" value={stats.pendentes} icon={Bell} />
        <StatCard title="Enviadas (Sucesso)" value={stats.enviadas} icon={Bell} />
        <StatCard title="Falhas" value={stats.falhas} icon={Bell} />
        <StatCard title="Total (Geral)" value={stats.total} icon={Bell} />
      </div>
      
      <Tabs defaultValue="todas" onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="pendente">Na Fila</TabsTrigger>
          <TabsTrigger value="enviada">Enviadas</TabsTrigger>
          <TabsTrigger value="falha">Falhas</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {notificacoesQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Card>
              <CardContent className="p-0">
                <DataTable 
                  columns={columns} 
                  data={notificacoesQuery.data || []} 
                  searchKey="destinatarioNome"
                  searchPlaceholder="Buscar por destinatário..."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
