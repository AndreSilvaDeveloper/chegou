import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Apartamento, Encomenda, Morador } from '../api/types';

export function NovaEncomenda() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [selectedApto, setSelectedApto] = useState<Apartamento | null>(null);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [moradorId, setMoradorId] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      api.get<Apartamento[]>(`/apartamentos${params}`).then(setAptos);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!selectedApto) {
      setMoradores([]);
      return;
    }
    api.get<Morador[]>(`/apartamentos/${selectedApto.id}/moradores`).then(setMoradores);
  }, [selectedApto]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedApto) {
      setError('Escolha um apartamento');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let fotoUrl: string | undefined;
      if (foto) {
        const fd = new FormData();
        fd.append('file', foto);
        const up = await api.upload<{ url: string }>('/uploads/encomenda-foto', fd);
        fotoUrl = up.url;
      }
      const r = await api.post<Encomenda>('/encomendas', {
        apartamentoId: selectedApto.id,
        moradorDestinoId: moradorId || undefined,
        descricao: descricao || undefined,
        transportadora: transportadora || undefined,
        fotoUrl,
      });
      nav(`/encomendas/${r.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-800">Nova encomenda</h1>

      {!selectedApto ? (
        <div className="card space-y-3">
          <label className="label">Buscar apartamento</label>
          <input
            className="input"
            placeholder="Ex: A-101 ou 101"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {aptos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedApto(a)}
                className="px-3 py-3 rounded-lg border border-slate-200 bg-white text-sm font-mono font-semibold hover:bg-brand-50 hover:border-brand-300"
              >
                {a.identificador}
              </button>
            ))}
            {aptos.length === 0 && q && (
              <div className="col-span-full text-sm text-slate-500">Nenhum apartamento encontrado.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Apartamento</div>
              <div className="font-mono text-2xl font-bold text-slate-800">{selectedApto.identificador}</div>
            </div>
            <button type="button" onClick={() => setSelectedApto(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Trocar
            </button>
          </div>

          {moradores.length > 0 && (
            <div>
              <label className="label">Destinatário (opcional)</label>
              <select className="input" value={moradorId} onChange={(e) => setMoradorId(e.target.value)}>
                <option value="">— Para o apartamento —</option>
                {moradores.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} {m.principal ? '(principal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Descrição</label>
            <input
              className="input"
              placeholder="Ex: Caixa Amazon, envelope dos Correios"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Transportadora (opcional)</label>
            <input className="input" value={transportadora} onChange={(e) => setTransportadora(e.target.value)} />
          </div>

          <div>
            <label className="label">Foto da encomenda (opcional)</label>
            {fotoPreview ? (
              <div className="space-y-2">
                <img src={fotoPreview} alt="Preview" className="rounded-lg max-h-48 border border-slate-200" />
                <button
                  type="button"
                  onClick={() => { setFoto(null); setFotoPreview(null); }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remover foto
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFoto(f);
                    setFotoPreview(URL.createObjectURL(f));
                  }
                }}
                className="input"
              />
            )}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando…' : 'Salvar e notificar'}
            </button>
            <button type="button" onClick={() => nav('/')} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
