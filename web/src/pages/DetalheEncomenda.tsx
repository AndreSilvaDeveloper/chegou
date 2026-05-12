import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../api/client';
import { Encomenda } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';

const STATUS_BADGE: Record<string, string> = {
  aguardando: 'bg-amber-50 text-amber-700',
  notificado: 'bg-blue-50 text-blue-700',
  retirada: 'bg-emerald-50 text-emerald-700',
  cancelada: 'bg-slate-100 text-slate-600',
};

export function DetalheEncomenda() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const user = getUser();
  const [enc, setEnc] = useState<Encomenda | null>(null);
  const [codigo, setCodigo] = useState('');
  const [documento, setDocumento] = useState('');
  const [tab, setTab] = useState<'codigo' | 'documento'>('codigo');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const load = () => api.get<Encomenda>(`/encomendas/${id}`).then(setEnc);

  useEffect(() => {
    load();
  }, [id]);

  if (!enc) return <div className="text-slate-500">Carregando…</div>;

  const ativa = enc.status === 'aguardando' || enc.status === 'notificado';
  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';

  const retirar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/encomendas/${enc.id}/retirar`, {
        codigoRetirada: tab === 'codigo' ? codigo : undefined,
        documentoRetirada: tab === 'documento' ? documento : undefined,
      });
      await load();
      setCodigo('');
      setDocumento('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    if (!motivo.trim()) {
      setError('Motivo é obrigatório');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/encomendas/${enc.id}/cancelar`, { motivo });
      await load();
      setShowCancel(false);
      setMotivo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar</Link>

      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">Apartamento</div>
            <div className="font-mono text-2xl font-bold text-slate-800">{enc.apartamento?.identificador}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`badge ${STATUS_BADGE[enc.status]}`}>{enc.status}</span>
            {enc.notificacao && <NotifBadge notif={enc.notificacao} showDetail />}
          </div>
        </div>

        {enc.notificacao?.status === 'failed' && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            A notificação por WhatsApp não foi entregue
            {enc.notificacao.errorMessage ? ` (${enc.notificacao.errorMessage})` : ''}.
            No sandbox da Twilio, peça ao morador para enviar qualquer mensagem ao número do sandbox e crie a encomenda novamente; em produção, isso é resolvido com os templates aprovados pela Meta.
          </div>
        )}

        {ativa && (
          <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-center">
            <div className="text-xs text-brand-700">Código de retirada</div>
            <div className="font-mono text-4xl font-bold text-brand-700 tracking-widest">{enc.codigoRetirada}</div>
          </div>
        )}

        {enc.fotoUrl && (
          <a href={enc.fotoUrl} target="_blank" rel="noreferrer">
            <img src={enc.fotoUrl} alt="Foto da encomenda" className="rounded-lg max-h-64 border border-slate-200" />
          </a>
        )}

        <dl className="text-sm space-y-1">
          {enc.descricao && (<div><dt className="text-slate-500 inline">Descrição: </dt><dd className="inline">{enc.descricao}</dd></div>)}
          {enc.transportadora && (<div><dt className="text-slate-500 inline">Transportadora: </dt><dd className="inline">{enc.transportadora}</dd></div>)}
          {enc.moradorDestino && (<div><dt className="text-slate-500 inline">Destinatário: </dt><dd className="inline">{enc.moradorDestino.nome}</dd></div>)}
          <div><dt className="text-slate-500 inline">Recebida em: </dt><dd className="inline">{new Date(enc.createdAt).toLocaleString('pt-BR')}</dd></div>
          {enc.notificadaAt && (<div><dt className="text-slate-500 inline">Notificada em: </dt><dd className="inline">{new Date(enc.notificadaAt).toLocaleString('pt-BR')}</dd></div>)}
          {enc.retiradaAt && (<div><dt className="text-slate-500 inline">Retirada em: </dt><dd className="inline">{new Date(enc.retiradaAt).toLocaleString('pt-BR')}</dd></div>)}
          {enc.retiradaDocumento && (<div><dt className="text-slate-500 inline">Documento: </dt><dd className="inline font-mono">{enc.retiradaDocumento}</dd></div>)}
          {enc.cancelamentoMotivo && (<div><dt className="text-slate-500 inline">Cancelamento: </dt><dd className="inline">{enc.cancelamentoMotivo}</dd></div>)}
        </dl>
      </div>

      {ativa && (
        <form onSubmit={retirar} className="card space-y-3">
          <h2 className="font-semibold text-slate-800">Registrar retirada</h2>
          <div className="flex gap-1 text-sm">
            <button
              type="button"
              onClick={() => setTab('codigo')}
              className={`px-3 py-1.5 rounded-md ${tab === 'codigo' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Por código
            </button>
            <button
              type="button"
              onClick={() => setTab('documento')}
              className={`px-3 py-1.5 rounded-md ${tab === 'documento' ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Por documento
            </button>
          </div>
          {tab === 'codigo' ? (
            <input
              className="input font-mono text-2xl tracking-widest text-center"
              placeholder="0000"
              maxLength={4}
              pattern="\d{4}"
              inputMode="numeric"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          ) : (
            <input
              className="input"
              placeholder="Número do documento (CPF, RG…)"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              autoFocus
            />
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Confirmando…' : 'Confirmar retirada'}
          </button>
        </form>
      )}

      {ativa && isAdmin && (
        <div className="card space-y-2">
          {!showCancel ? (
            <button type="button" onClick={() => setShowCancel(true)} className="text-sm text-red-600 hover:text-red-800">
              Cancelar encomenda
            </button>
          ) : (
            <>
              <label className="label">Motivo do cancelamento</label>
              <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button onClick={cancelar} disabled={saving} className="btn-danger flex-1">Cancelar encomenda</button>
                <button onClick={() => { setShowCancel(false); setError(null); }} className="btn-secondary">Voltar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
