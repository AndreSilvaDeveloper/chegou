import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Apartamento, Morador } from '../api/types';

export function Moradores() {
  const [list, setList] = useState<Morador[]>([]);
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [form, setForm] = useState({
    apartamentoId: '',
    nome: '',
    telefoneE164: '',
    documento: '',
    principal: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<Morador[]>('/moradores').then(setList);
    api.get<Apartamento[]>('/apartamentos').then(setAptos);
  };

  useEffect(() => { load(); }, []);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/moradores', {
        apartamentoId: form.apartamentoId,
        nome: form.nome,
        telefoneE164: form.telefoneE164 || undefined,
        documento: form.documento || undefined,
        principal: form.principal,
      });
      setForm({ apartamentoId: '', nome: '', telefoneE164: '', documento: '', principal: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm('Desativar este morador?')) return;
    await api.delete(`/moradores/${id}`);
    await load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Moradores</h1>

      <form onSubmit={criar} className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Novo morador</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Apartamento *</label>
            <select className="input" value={form.apartamentoId} onChange={(e) => setForm({ ...form, apartamentoId: e.target.value })} required>
              <option value="">— Selecione —</option>
              {aptos.map((a) => <option key={a.id} value={a.id}>{a.identificador}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div>
            <label className="label">Telefone (E.164: +5511...)</label>
            <input className="input" value={form.telefoneE164} onChange={(e) => setForm({ ...form, telefoneE164: e.target.value })} placeholder="+5511988887777" />
          </div>
          <div>
            <label className="label">Documento</label>
            <input className="input" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.checked })} />
          Morador principal (contato preferencial do apartamento)
        </label>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Adicionar'}
        </button>
      </form>

      <div className="card">
        <div className="text-sm text-slate-500 mb-2">{list.length} ativos</div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs">
            <tr>
              <th className="py-2">Nome</th>
              <th>Apto</th>
              <th>Telefone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="py-2">
                  {m.nome} {m.principal && <span className="badge bg-brand-50 text-brand-700 ml-1">principal</span>}
                </td>
                <td className="font-mono">{m.apartamento?.identificador}</td>
                <td className="font-mono text-slate-600">{m.telefoneE164 ?? '—'}</td>
                <td className="text-right">
                  <button onClick={() => desativar(m.id)} className="text-xs text-red-500 hover:text-red-700">Desativar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
