import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Apartamento } from '../api/types';

export function ApartamentosManager({ basePath = '' }: { basePath?: string }) {
  const [list, setList] = useState<Apartamento[]>([]);
  const [bloco, setBloco] = useState('');
  const [numero, setNumero] = useState('');
  const [obs, setObs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ bloco: '', numero: '', observacoes: '' });

  const url = (p: string) => `${basePath}/apartamentos${p}`;
  const load = () => api.get<Apartamento[]>(url('')).then(setList);

  useEffect(() => { load(); }, [basePath]);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(url(''), { bloco: bloco || undefined, numero, observacoes: obs || undefined });
      setBloco(''); setNumero(''); setObs('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: Apartamento) => {
    setEditId(a.id);
    setEditForm({ bloco: a.bloco ?? '', numero: a.numero, observacoes: a.observacoes ?? '' });
    setError(null);
  };

  const salvarEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(url(`/${editId}`), {
        bloco: editForm.bloco || null,
        numero: editForm.numero,
        observacoes: editForm.observacoes || null,
      });
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm('Desativar este apartamento?')) return;
    await api.delete(url(`/${id}`));
    await load();
  };

  return (
    <div className="space-y-4">
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
        {error && !editId && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Adicionar'}</button>
      </form>

      <div className="card">
        <div className="text-sm text-slate-500 mb-2">{list.length} ativos</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {list.map((a) => (
            <div key={a.id} className="border border-slate-200 rounded-lg p-2 text-sm">
              {editId === a.id ? (
                <form onSubmit={salvarEdit} className="space-y-1">
                  <input className="input py-1 text-sm" value={editForm.bloco} onChange={(e) => setEditForm({ ...editForm, bloco: e.target.value })} placeholder="Bloco" />
                  <input className="input py-1 text-sm" value={editForm.numero} onChange={(e) => setEditForm({ ...editForm, numero: e.target.value })} placeholder="Número" required />
                  <input className="input py-1 text-sm" value={editForm.observacoes} onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })} placeholder="Obs" />
                  <div className="flex gap-1">
                    <button type="submit" disabled={saving} className="btn-primary py-1 px-2 text-xs flex-1">Salvar</button>
                    <button type="button" onClick={() => setEditId(null)} className="btn-secondary py-1 px-2 text-xs">×</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="font-mono font-semibold">{a.identificador}</div>
                  {a.observacoes && <div className="text-xs text-slate-500 truncate">{a.observacoes}</div>}
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => startEdit(a)} className="text-xs text-brand-600 hover:text-brand-800">Editar</button>
                    <button onClick={() => desativar(a.id)} className="text-xs text-red-500 hover:text-red-700">Desativar</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {list.length === 0 && <div className="text-slate-500 text-sm col-span-full">Nenhum apartamento.</div>}
        </div>
        {error && editId && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-2">{error}</div>}
      </div>
    </div>
  );
}
