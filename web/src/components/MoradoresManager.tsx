import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Apartamento, Morador } from '../api/types';

interface MoradorForm {
  apartamentoId: string;
  nome: string;
  telefoneE164: string;
  documento: string;
  email: string;
  principal: boolean;
  receberWhatsapp: boolean;
}

const emptyForm: MoradorForm = {
  apartamentoId: '',
  nome: '',
  telefoneE164: '',
  documento: '',
  email: '',
  principal: false,
  receberWhatsapp: true,
};

export function MoradoresManager({ basePath = '' }: { basePath?: string }) {
  const [list, setList] = useState<Morador[]>([]);
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [form, setForm] = useState<MoradorForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MoradorForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mUrl = (p: string) => `${basePath}/moradores${p}`;
  const load = () => {
    api.get<Morador[]>(mUrl('')).then(setList);
    api.get<Apartamento[]>(`${basePath}/apartamentos`).then(setAptos);
  };

  useEffect(() => { load(); }, [basePath]);

  const toPayload = (f: MoradorForm) => ({
    apartamentoId: f.apartamentoId,
    nome: f.nome,
    telefoneE164: f.telefoneE164 || null,
    documento: f.documento || null,
    email: f.email || null,
    principal: f.principal,
    receberWhatsapp: f.receberWhatsapp,
  });

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(mUrl(''), { ...toPayload(form), telefoneE164: form.telefoneE164 || undefined, documento: form.documento || undefined, email: form.email || undefined });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m: Morador) => {
    setEditId(m.id);
    setEditForm({
      apartamentoId: m.apartamentoId,
      nome: m.nome,
      telefoneE164: m.telefoneE164 ?? '',
      documento: m.documento ?? '',
      email: m.email ?? '',
      principal: m.principal,
      receberWhatsapp: m.receberWhatsapp,
    });
    setError(null);
  };

  const salvarEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(mUrl(`/${editId}`), toPayload(editForm));
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm('Desativar este morador?')) return;
    await api.delete(mUrl(`/${id}`));
    await load();
  };

  const renderFields = (f: MoradorForm, set: (f: MoradorForm) => void) => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Apartamento *</label>
          <select className="input" value={f.apartamentoId} onChange={(e) => set({ ...f, apartamentoId: e.target.value })} required>
            <option value="">— Selecione —</option>
            {aptos.map((a) => <option key={a.id} value={a.id}>{a.identificador}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Nome *</label>
          <input className="input" value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} required />
        </div>
        <div>
          <label className="label">Telefone (E.164: +5511...)</label>
          <input className="input font-mono" value={f.telefoneE164} onChange={(e) => set({ ...f, telefoneE164: e.target.value })} placeholder="+5511988887777" />
        </div>
        <div>
          <label className="label">Documento</label>
          <input className="input" value={f.documento} onChange={(e) => set({ ...f, documento: e.target.value })} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" value={f.email} onChange={(e) => set({ ...f, email: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.principal} onChange={(e) => set({ ...f, principal: e.target.checked })} />
          Morador principal (contato preferencial do apartamento)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.receberWhatsapp} onChange={(e) => set({ ...f, receberWhatsapp: e.target.checked })} />
          Recebe avisos por WhatsApp
        </label>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <form onSubmit={criar} className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Novo morador</h2>
        {renderFields(form, setForm)}
        {error && !editId && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Adicionar'}</button>
      </form>

      <div className="card">
        <div className="text-sm text-slate-500 mb-2">{list.length} ativos</div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs">
            <tr><th className="py-2">Nome</th><th>Apto</th><th>Telefone</th><th>Whats</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((m) => (
              editId === m.id ? (
                <tr key={m.id} className="border-t border-slate-100">
                  <td colSpan={5} className="py-3">
                    <form onSubmit={salvarEdit} className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="font-medium text-slate-700">Editando: {m.nome}</div>
                      {renderFields(editForm, setEditForm)}
                      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
                        <button type="button" onClick={() => setEditId(null)} className="btn-secondary">Cancelar</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="py-2">{m.nome} {m.principal && <span className="badge bg-brand-50 text-brand-700 ml-1">principal</span>}</td>
                  <td className="font-mono">{m.apartamento?.identificador}</td>
                  <td className="font-mono text-slate-600">{m.telefoneE164 ?? '—'}</td>
                  <td>{m.receberWhatsapp ? '✓' : '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => startEdit(m)} className="text-xs text-brand-600 hover:text-brand-800 mr-3">Editar</button>
                    <button onClick={() => desativar(m.id)} className="text-xs text-red-500 hover:text-red-700">Desativar</button>
                  </td>
                </tr>
              )
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Nenhum morador.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
