import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, getUser } from '../api/client';
import { Encomenda, EncomendaStatus, ListarEncomendasResponse } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Clock, PackageCheck, Timer, Plus, Download, Search, Calendar, ChevronRight, Truck } from 'lucide-react';
import { timeAgo, formatDateTime, cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CodigoStrip } from '@/components/ui/codigo-strip';
import { StatusDot } from '@/components/ui/status-dot';

type Tone = "waiting" | "notified" | "done" | "neutral" | "danger";
const STATUS_CONFIG: Record<EncomendaStatus, { label: string; tone: Tone; pulse?: boolean }> = {
  aguardando: { label: 'Aguardando', tone: 'waiting', pulse: true },
  notificado: { label: 'Notificado', tone: 'notified', pulse: true },
  retirada: { label: 'Retirada', tone: 'done' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
  devolvida: { label: 'Devolvida', tone: 'neutral' },
};

type Filtro = 'pendentes' | 'todas' | 'retiradas' | 'canceladas';

const MOCK_CHART_DATA = [
  { name: 'Seg', total: 12 },
  { name: 'Ter', total: 18 },
  { name: 'Qua', total: 15 },
  { name: 'Qui', total: 25 },
  { name: 'Sex', total: 32 },
  { name: 'Sáb', total: 10 },
  { name: 'Dom', total: 5 },
];

export function Dashboard() {
  const user = getUser();
  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';
  const [items, setItems] = useState<Encomenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [ate, setAte] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (desde) p.set('desde', desde);
    if (ate) p.set('ate', ate);
    return p;
  }, [q, desde, ate]);

  useEffect(() => {
    setLoading(true);
    const run = async () => {
      try {
        if (filtro === 'pendentes') {
          const a = await api.get<ListarEncomendasResponse>(`/encomendas?status=aguardando&${params}`);
          const n = await api.get<ListarEncomendasResponse>(`/encomendas?status=notificado&${params}`);
          setItems([...a.items, ...n.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } else if (filtro === 'todas') {
          const r = await api.get<ListarEncomendasResponse>(`/encomendas?${params}`);
          setItems(r.items);
        } else {
          const r = await api.get<ListarEncomendasResponse>(`/encomendas?status=${filtro === 'retiradas' ? 'retirada' : 'cancelada'}&${params}`);
          setItems(r.items);
        }
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [filtro, params]);

  const exportCsv = () => {
    const base = import.meta.env.VITE_API_URL || '';
    const url = `${base}/api/encomendas/export.csv?${params}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
        link.remove();
      });
  };

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        eyebrow="Portaria"
        title="Central de encomendas"
        description="Acompanhe as entregas e métricas do condomínio"
      >
        <div className="flex w-full gap-2 sm:w-auto">
          {isAdmin && (
            <Button onClick={exportCsv} variant="outline" className="hidden sm:flex">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          )}
          <Link to="/encomendas/nova" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" type="button">
              <Plus className="mr-2 h-4 w-4" />
              Registrar Encomenda
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Recebido (Mês)"
          value="186"
          icon={Package}
          trend={{ value: 12, label: "vs. mês passado" }}
          variant="primary"
        />
        <StatCard
          title="Aguardando Retirada"
          value={filtro === 'pendentes' ? items.length : "24"}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Retiradas Hoje"
          value="18"
          icon={PackageCheck}
          variant="success"
        />
        <StatCard
          title="Tempo Médio"
          value="4h 30m"
          icon={Timer}
          description="De recebimento até retirada"
        />
      </div>

      {/* Chart Section */}
      <Card className="col-span-1 hidden md:block">
        <CardHeader>
          <CardTitle>Volume de Encomendas</CardTitle>
          <CardDescription>
            Quantidade de encomendas recebidas nos últimos 7 dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_CHART_DATA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="name" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}`} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTotal)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* List Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1 sm:pb-1">
            {(['pendentes', 'todas', 'retiradas', 'canceladas'] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  "min-h-[40px] whitespace-nowrap rounded-lg px-4 text-sm font-medium capitalize transition-colors",
                  filtro === f
                    ? "bg-card text-foreground shadow-panel"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[600px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                className="pl-9 h-9" 
                placeholder="Buscar (apto, cód)" 
                value={q} 
                onChange={(e) => setQ(e.target.value)} 
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                className="pl-9 h-9" 
                type="date" 
                value={desde} 
                onChange={(e) => setDesde(e.target.value)} 
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                className="pl-9 h-9" 
                type="date" 
                value={ate} 
                onChange={(e) => setAte(e.target.value)} 
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState 
            icon={Package} 
            title="Nenhuma encomenda encontrada" 
            description="Não encontramos resultados para os filtros selecionados." 
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((e) => {
              const conf = STATUS_CONFIG[e.status];
              const pendente = e.status === 'aguardando' || e.status === 'notificado';
              return (
                <Link key={e.id} to={`/encomendas/${e.id}`} className="group block">
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardContent className="flex h-full flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                              {e.apartamento?.identificador}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          </div>
                          <div className="mt-2">
                            <StatusDot tone={conf.tone} label={conf.label} pulse={conf.pulse} />
                          </div>
                        </div>
                        {pendente && (
                          <CodigoStrip codigo={e.codigoRetirada} active={e.status === 'notificado'} />
                        )}
                      </div>

                      <div className="mt-auto space-y-1.5 border-t border-border pt-3 text-sm">
                        <p className="line-clamp-1 font-medium text-foreground">
                          {e.descricao || 'Sem descrição'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {e.transportadora && (
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3.5 w-3.5" />{e.transportadora}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />{timeAgo(e.createdAt)}
                          </span>
                          <span className="font-mono">{formatDateTime(e.createdAt)}</span>
                        </div>
                      </div>

                      {e.notificacao?.status === 'failed' && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                          <NotifBadge notif={e.notificacao} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
