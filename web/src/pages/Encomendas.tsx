import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, getUser } from '../api/client';
import { Encomenda, EncomendaStatus, ListarEncomendasResponse } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Clock, Plus, Download, Search, ChevronRight, Truck, User } from 'lucide-react';
import { timeAgo, formatDateTime, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { CodigoStrip } from '@/components/ui/codigo-strip';
import { StatusDot } from '@/components/ui/status-dot';

type Tone = 'waiting' | 'notified' | 'done' | 'neutral' | 'danger';
const STATUS_CONFIG: Record<EncomendaStatus, { label: string; tone: Tone; pulse?: boolean }> = {
  aguardando: { label: 'Aguardando', tone: 'waiting', pulse: true },
  notificado: { label: 'Notificado', tone: 'notified', pulse: true },
  retirada: { label: 'Retirada', tone: 'done' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
  devolvida: { label: 'Devolvida', tone: 'neutral' },
};

type Filtro = 'pendentes' | 'retirados' | 'cancelados' | 'todos';
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'retirados', label: 'Retirados' },
  { key: 'cancelados', label: 'Cancelados' },
  { key: 'todos', label: 'Todos' },
];

export function Encomendas() {
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
          const [a, n] = await Promise.all([
            api.get<ListarEncomendasResponse>(`/encomendas?status=aguardando&${params}`),
            api.get<ListarEncomendasResponse>(`/encomendas?status=notificado&${params}`),
          ]);
          setItems([...a.items, ...n.items].sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()));
        } else if (filtro === 'todos') {
          const r = await api.get<ListarEncomendasResponse>(`/encomendas?${params}`);
          setItems(r.items);
        } else {
          const status = filtro === 'retirados' ? 'retirada' : 'cancelada';
          const r = await api.get<ListarEncomendasResponse>(`/encomendas?status=${status}&${params}`);
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
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.download = `encomendas-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(blobUrl);
        link.remove();
      });
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Portaria" title="Encomendas">
        <div className="flex w-full gap-2 sm:w-auto">
          {isAdmin && (
            <Button onClick={exportCsv} variant="outline" className="hidden sm:flex">
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          )}
          <Link to="/encomendas/nova" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" type="button">
              <Plus className="mr-2 h-4 w-4" /> Registrar Encomenda
            </Button>
          </Link>
        </div>
      </PageHeader>

      <div className="space-y-3">
        {/* Filtro de status — todos na mesma linha, com o selecionado bem destacado */}
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:flex sm:w-fit">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={cn(
                'min-h-[40px] whitespace-nowrap rounded-lg px-0.5 py-2 text-center txt-apoio font-semibold transition-colors sm:px-5',
                filtro === f.key
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Busca + datas (as duas datas na mesma linha, compactas) */}
        <div className="space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
          <div className="relative lg:max-w-xs lg:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-9" placeholder="Buscar (apto, cód)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:flex">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 txt-apoio font-medium text-muted-foreground">De</span>
              <Input className="h-9 pl-8" type="date" title="Data inicial" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 txt-apoio font-medium text-muted-foreground">Até</span>
              <Input className="h-9 pl-9" type="date" title="Data final" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title="Nenhuma encomenda encontrada" description="Não encontramos resultados para os filtros selecionados." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => {
            const conf = STATUS_CONFIG[e.status];
            const pendente = e.status === 'aguardando' || e.status === 'notificado';
            return (
              <Link key={e.id} to={`/encomendas/${e.id}`} className="group block">
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="flex h-full flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono txt-numero-sm font-bold tracking-tight text-foreground">
                            {e.apartamento?.identificador}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                        {e.destinatarioNome && (
                          <p className="mt-1 flex items-center gap-1 txt-corpo font-medium text-foreground">
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{e.destinatarioNome}</span>
                          </p>
                        )}
                        <div className="mt-2">
                          <StatusDot tone={conf.tone} label={conf.label} pulse={conf.pulse} />
                        </div>
                      </div>
                      {pendente && <CodigoStrip codigo={e.codigoRetirada} active={e.status === 'notificado'} />}
                    </div>

                    <div className="mt-auto space-y-1.5 border-t border-border pt-3 txt-corpo">
                      <p className="line-clamp-1 font-medium text-foreground">{e.descricao || 'Sem descrição'}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 txt-apoio text-muted-foreground">
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
                      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 txt-apoio font-medium text-destructive">
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
  );
}
