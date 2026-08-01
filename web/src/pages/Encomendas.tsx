import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, getUser } from '../api/client';
import { Encomenda, ListarEncomendasResponse } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';
import { PageShell } from '@/components/ui/page-shell';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Clock, Plus, Download, Truck, User, Box } from 'lucide-react';
import { timeAgo, formatDateTime } from '@/lib/utils';
import { ListCard } from '@/components/ui/list-card';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { CodigoStrip } from '@/components/ui/codigo-strip';
import { StatusDot } from '@/components/ui/status-dot';
import { ENCOMENDA_STATUS, encomendaPendente } from '@/components/encomendas/encomenda-status';

type Filtro = 'pendentes' | 'retirados' | 'cancelados' | 'todos';
const FILTROS: OpcaoSegmento<Filtro>[] = [
  { valor: 'pendentes', label: 'Pendentes' },
  { valor: 'retirados', label: 'Retirados' },
  { valor: 'cancelados', label: 'Cancelados' },
  { valor: 'todos', label: 'Todos' },
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
    <PageShell
      icon={Package}
      eyebrow="Portaria"
      title="Encomendas"
      busca={{ valor: q, aoMudar: setQ, placeholder: 'Buscar por apartamento ou código…' }}
      filtrosAtivos={(desde ? 1 : 0) + (ate ? 1 : 0)}
      aoLimparFiltros={() => {
        setDesde('');
        setAte('');
      }}
      filtros={
        <>
          <div className="space-y-2">
            <Label htmlFor="filtro-desde">Recebidas a partir de</Label>
            <Input
              id="filtro-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filtro-ate">Até</Label>
            <Input
              id="filtro-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </>
      }
      acoes={
        <>
          {isAdmin && (
            <Button onClick={exportCsv} variant="outline" className="flex-1 rounded-full sm:flex-none">
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          )}
          <Link to="/encomendas/nova" className="flex-1 sm:flex-none">
            <Button className="w-full rounded-full" type="button">
              <Plus className="mr-2 h-4 w-4" /> Registrar Encomenda
            </Button>
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <SegmentedFilter
          aria="Filtrar encomendas por situação"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={FILTROS}
        />

        {/* Busca e período subiram para a faixa/gaveta do `PageShell`. */}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title="Nenhuma encomenda encontrada" description="Não encontramos resultados para os filtros selecionados." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => {
            const conf = ENCOMENDA_STATUS[e.status];
            const pendente = encomendaPendente(e.status);
            return (
              <ListCard
                key={e.id}
                to={`/encomendas/${e.id}`}
                icone={Package}
                titulo={<span className="font-mono">{e.apartamento?.identificador}</span>}
                subtitulo={
                  e.destinatarioNome ? (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{e.destinatarioNome}</span>
                    </span>
                  ) : undefined
                }
                // O código é o elemento de assinatura do produto e continua no
                // canto — mas só enquanto a encomenda está para ser retirada.
                destaque={
                  pendente ? (
                    <CodigoStrip codigo={e.codigoRetirada} active={e.status === 'notificado'} />
                  ) : undefined
                }
                campos={[
                  {
                    rotulo: 'Situação',
                    valor: <StatusDot tone={conf.tone} label={conf.label} pulse={conf.pulse} />,
                  },
                  {
                    rotulo: 'Recebida',
                    icone: Clock,
                    // O relativo é o que o porteiro lê ("há 2 h"); a data exata
                    // fica no title e na tela de detalhe.
                    valor: <span title={formatDateTime(e.createdAt)}>{timeAgo(e.createdAt)}</span>,
                  },
                  ...(e.transportadora
                    ? [{ rotulo: 'Transportadora', icone: Truck, valor: e.transportadora }]
                    : []),
                  {
                    rotulo: 'Conteúdo',
                    icone: Box,
                    largura: 'inteira' as const,
                    // Duas linhas no máximo: descrição comprida numa grade
                    // estica a linha inteira de cards.
                    valor: e.descricao ? (
                      <span className="line-clamp-2">{e.descricao}</span>
                    ) : (
                      <span className="text-muted-foreground">Sem descrição</span>
                    ),
                  },
                ]}
                rodape={
                  e.notificacao?.status === 'failed' ? (
                    <div className="flex w-full items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
                      <NotifBadge notif={e.notificacao} />
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}
      </div>
    </PageShell>
  );
}
