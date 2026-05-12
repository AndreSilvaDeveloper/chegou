import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken, getUser } from '../api/client';
import { Encomenda, EncomendaStatus, ListarEncomendasResponse } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';

const STATUS_LABELS: Record<EncomendaStatus, { label: string; cls: string }> = {
  aguardando: { label: 'Aguardando', cls: 'bg-amber-50 text-amber-700' },
  notificado: { label: 'Notificado', cls: 'bg-blue-50 text-blue-700' },
  retirada: { label: 'Retirada', cls: 'bg-emerald-50 text-emerald-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-600' },
  devolvida: { label: 'Devolvida', cls: 'bg-slate-100 text-slate-600' },
};

type Filtro = 'pendentes' | 'todas' | 'retiradas' | 'canceladas';

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
          setItems([...a.items, ...n.items]);
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
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [filtro, params]);

  const exportCsv = () => {
    const base = import.meta.env.VITE_API_URL || '';
    const url = `${base}/api/encomendas/export.csv?${params}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    // fetch then trigger download because Authorization header is needed
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">Encomendas</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={exportCsv} className="btn-secondary">⬇ CSV</button>
          )}
          <Link to="/encomendas/nova" className="btn-primary">+ Nova encomenda</Link>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex gap-1 text-sm overflow-x-auto">
          {(['pendentes', 'todas', 'retiradas', 'canceladas'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-md capitalize whitespace-nowrap ${filtro === f ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="input" placeholder="Buscar (descrição, código, apto)" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="card text-center text-slate-500">Nenhuma encomenda encontrada.</div>
      ) : (
        <div className="grid gap-2">
          {items.map((e) => {
            const s = STATUS_LABELS[e.status];
            return (
              <Link
                key={e.id}
                to={`/encomendas/${e.id}`}
                className="card hover:shadow-md transition-shadow flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg font-semibold text-slate-800">
                      {e.apartamento?.identificador}
                    </span>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                    {e.notificacao?.status === 'failed' && <NotifBadge notif={e.notificacao} />}
                  </div>
                  <div className="text-sm text-slate-600 truncate">
                    {e.descricao ?? 'Sem descrição'}
                    {e.transportadora && <span className="text-slate-400"> · {e.transportadora}</span>}
                  </div>
                </div>
                {(e.status === 'aguardando' || e.status === 'notificado') && (
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Código</div>
                    <div className="font-mono text-xl font-bold text-brand-700">{e.codigoRetirada}</div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
