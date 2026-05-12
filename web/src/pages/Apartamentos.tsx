import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Apartamento } from '../api/types';

export function Apartamentos() {
  const [list, setList] = useState<Apartamento[]>([]);
  const [bloco, setBloco] = useState('');
  const [numero, setNumero] = useState('');
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get<Apartamento[]>('/apartamentos').then(setList);

  useEffect(() => { load(); }, []);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post<Apartamento>('/apartamentos', {
        bloco: bloco || undefined,
        numero,
        observacoes: obs || undefined,
      });
      setBloco('');
      setNumero('');
      setObs('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm('Desativar este apartamento?')) return;
    await api.delete(`/apartamentos/${id}`);
    await load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Apartamentos</h1>

      <form onSubmit={criar} className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Novo apartamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Bloco (opcional)</label>
            <input className="input" value={bloco} onChange={(e) => setBloco(e.target.value)} placeholder="A" />
          </div>
          <div>
            <label className="label">Número *</label>
            <input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} required placeholder="101" />
          </div>
          <div>
            <label className="label">Observações</label>
            <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Adicionar'}
        </button>
      </form>

      <div className="card">
        <div className="text-sm text-slate-500 mb-2">{list.length} ativos</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {list.map((a) => (
            <div key={a.id} className="border border-slate-200 rounded-lg p-2 text-sm">
              <div className="font-mono font-semibold">{a.identificador}</div>
              <button onClick={() => desativar(a.id)} className="text-xs text-red-500 hover:text-red-700 mt-1">
                Desativar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
