import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { Notificacao, StatusNotificacao } from '@/api/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ListChecks, Clock, CalendarClock, CheckCircle2, AlertTriangle,
  Send, XCircle, RefreshCw, Phone, Home,
} from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FilaStats {
  total: number;
  naFila: number;
  agendadas: number;
  enviadas: number;
  falhas: number;
  canceladas: number;
}

type TabKey = 'todas' | 'na-fila' | 'agendada' | 'enviada' | 'falha';

/** O `status` vai como parâmetro para a API; vazio = sem filtro. */
const FILTROS: (OpcaoSegmento<TabKey> & { status: string })[] = [
  { valor: 'todas', label: 'Todos', status: '' },
  { valor: 'na-fila', label: 'Na fila', status: 'pendente' },
  { valor: 'agendada', label: 'Agendado', status: 'agendada' },
  { valor: 'enviada', label: 'Enviados', status: 'enviada' },
  { valor: 'falha', label: 'Falhas', status: 'falha' },
];

type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'outline';
const STATUS_META: Record<StatusNotificacao, { label: string; variant: BadgeVariant; dot: string }> = {
  pendente: { label: 'Na fila', variant: 'secondary', dot: 'bg-zinc-400 dark:bg-zinc-500' },
  agendada: { label: 'Agendado', variant: 'warning', dot: 'bg-amber-500' },
  enviando: { label: 'Enviando', variant: 'warning', dot: 'bg-amber-500 animate-pulse' },
  enviada: { label: 'Enviado', variant: 'success', dot: 'bg-emerald-500' },
  falha: { label: 'Falha', variant: 'destructive', dot: 'bg-red-500' },
  cancelada: { label: 'Cancelada', variant: 'outline', dot: 'bg-zinc-400 dark:bg-zinc-500' },
};

const fmt = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : '—');

export function Notificacoes() {
  const [activeTab, setActiveTab] = useState<TabKey>('todas');
  const queryClient = useQueryClient();

  const statusParam = FILTROS.find((f) => f.valor === activeTab)?.status ?? '';

  const notificacoesQuery = useQuery({
    queryKey: ['notificacoes', activeTab],
    queryFn: () =>
      api
        .get<{ items: Notificacao[]; total: number }>(`/notificacoes${statusParam ? `?status=${statusParam}` : ''}`)
        .then((res) => res.items),
    refetchInterval: 12000,
  });

  const statsQuery = useQuery({
    queryKey: ['notificacoes-stats'],
    queryFn: () => api.get<FilaStats>('/notificacoes/stats'),
    refetchInterval: 12000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notificacoes'] });
    queryClient.invalidateQueries({ queryKey: ['notificacoes-stats'] });
  };

  const cancelarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notificacoes/${id}/cancelar`),
    onSuccess: () => { toast.success('Notificação cancelada.'); invalidate(); },
    onError: () => toast.error('Falha ao cancelar notificação'),
  });

  const reenviarMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notificacoes/${id}/reenviar`),
    onSuccess: () => { toast.success('Reenviado para a fila!'); invalidate(); },
    onError: () => toast.error('Falha ao reenviar notificação'),
  });

  const stats: FilaStats = statsQuery.data ?? { total: 0, naFila: 0, agendadas: 0, enviadas: 0, falhas: 0, canceladas: 0 };

  const cards = [
    { key: 'todas' as TabKey, title: 'Total', value: stats.total, icon: ListChecks, variant: 'default' as const },
    { key: 'na-fila' as TabKey, title: 'Na fila', value: stats.naFila, icon: Clock, variant: 'primary' as const },
    { key: 'agendada' as TabKey, title: 'Agendado', value: stats.agendadas, icon: CalendarClock, variant: 'warning' as const },
    { key: 'enviada' as TabKey, title: 'Enviados', value: stats.enviadas, icon: CheckCircle2, variant: 'success' as const },
    { key: 'falha' as TabKey, title: 'Falhas', value: stats.falhas, icon: AlertTriangle, variant: 'danger' as const },
  ];

  const columns = [
    {
      accessorKey: 'destinatarioNome',
      header: 'Destinatário',
      cell: ({ row }: any) => {
        const n = row.original as Notificacao;
        return (
          <div className="min-w-0">
            <div className="font-medium text-foreground">{n.destinatarioNome || 'Desconhecido'}</div>
            <div className="flex items-center gap-1 font-mono txt-apoio text-muted-foreground">
              <Phone className="h-3 w-3" /> {n.destinatarioTelefone || '—'}
            </div>
          </div>
        );
      },
    },
    {
      id: 'unidade',
      header: 'Unidade',
      cell: ({ row }: any) => {
        const n = row.original as Notificacao;
        const identificador = n.morador?.apartamento?.identificador || n.variaveisJson?.unidade;
        return identificador ? (
          <div className="flex items-center gap-1.5 txt-corpo">
            <Home className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{identificador}</span>
          </div>
        ) : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }: any) => <Badge variant="outline" className="capitalize">{String(row.original.tipo).replace(/_/g, ' ')}</Badge>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => {
        const n = row.original as Notificacao;
        const meta = STATUS_META[n.status] ?? STATUS_META.pendente;
        return (
          <div className="space-y-1">
            <Badge variant={meta.variant} className="gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              {meta.label}
            </Badge>
            {n.status === 'falha' && n.erroMensagem && (
              <p className="max-w-[220px] truncate txt-apoio text-red-600 dark:text-red-400" title={n.erroMensagem}>
                {n.erroMensagem}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: 'datas',
      header: 'Datas',
      cell: ({ row }: any) => {
        const n = row.original as Notificacao;
        return (
          <div className="space-y-0.5 txt-apoio">
            <div className="text-muted-foreground">Criada: <span className="text-foreground">{fmt(n.createdAt)}</span></div>
            {n.status === 'enviada' && (
              <div className="text-muted-foreground">Enviada: <span className="text-emerald-600 dark:text-emerald-400">{fmt(n.enviadaAt)}</span></div>
            )}
            {n.status === 'agendada' && n.agendadaPara && (
              <div className="text-muted-foreground">Agendada: <span className="text-amber-600 dark:text-amber-400">{fmt(n.agendadaPara)}</span></div>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }: any) => {
        const n = row.original as Notificacao;
        if (n.status === 'falha') {
          return (
            <Button size="sm" onClick={() => reenviarMutation.mutate(n.id)} disabled={reenviarMutation.isPending} className="min-h-[40px]">
              <Send className="mr-1.5 h-4 w-4" /> Enviar manualmente
            </Button>
          );
        }
        if (n.status === 'pendente' || n.status === 'agendada') {
          return (
            <Button variant="ghost" size="sm" onClick={() => cancelarMutation.mutate(n.id)} disabled={cancelarMutation.isPending} className="min-h-[40px]">
              <XCircle className="mr-1.5 h-4 w-4 text-destructive" /> Cancelar
            </Button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <PageShell
      icon={ListChecks}
      eyebrow="Comunicação"
      title="Filas de Disparo"
      description="Acompanhe o status de cada mensagem na fila do WhatsApp e reenvie as que falharam."
      acoes={
        <Button
          variant="outline"
          onClick={() => invalidate()}
          className="flex-1 rounded-full sm:flex-none"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', (notificacoesQuery.isFetching || statsQuery.isFetching) && 'animate-spin')} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-6">
      {/* Cards de status — clique para filtrar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveTab(c.key)}
            className={cn(
              'rounded-xl text-left transition-all focus:outline-hidden',
              activeTab === c.key ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:opacity-90',
            )}
          >
            <StatCard title={c.title} value={c.value} icon={c.icon} variant={c.variant} className="h-full" />
          </button>
        ))}
      </div>

      {/* Filtro, não aba: os cinco recortes mostram a MESMA lista — por isso
          `SegmentedFilter` (botões com `aria-pressed`) e não `Tabs`. */}
      <div className="space-y-4">
        <SegmentedFilter
          aria="Filtrar mensagens por situação"
          valor={activeTab}
          aoMudar={setActiveTab}
          opcoes={FILTROS}
        />

        {notificacoesQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <Card>
            <CardContent className="p-0">
              <DataTable
                columns={columns}
                data={notificacoesQuery.data || []}
                searchKey="destinatarioNome"
                searchPlaceholder="Buscar por destinatário..."
                emptyStateTitle="Nenhuma mensagem nesta fila"
                emptyStateDescription="Quando uma encomenda for registrada, a notificação aparece aqui."
              />
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </PageShell>
  );
}
