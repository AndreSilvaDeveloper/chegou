import { FormEvent, useEffect, useState } from 'react';
import { api, getUser } from '../api/client';
import { Usuario, UserRole } from '../api/types';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administrador',
  porteiro: 'Porteiro',
};

interface UsuarioForm {
  nome: string;
  email: string;
  senha: string;
  role: UserRole;
  telefone: string;
}

export function EquipeManager({
  basePath = '',
  allowedRoles = ['porteiro', 'sindico'],
}: {
  basePath?: string;
  allowedRoles?: UserRole[];
}) {
  const meuId = getUser()?.id;
  const [list, setList] = useState<Usuario[]>([]);
  const emptyForm: UsuarioForm = { nome: '', email: '', senha: '', role: allowedRoles[0], telefone: '' };
  const [form, setForm] = useState<UsuarioForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ nome: string; email: string; role: UserRole; telefone: string; senha: string }>({
    nome: '', email: '', role: 'porteiro', telefone: '', senha: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const url = (p: string) => `${basePath}/usuarios${p}`;
  const load = () => api.get<Usuario[]>(url('')).then(setList);

  useEffect(() => { load(); }, [basePath]);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(url(''), {
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        role: form.role,
        telefone: form.telefone || undefined,
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: Usuario) => {
    setEditId(u.id);
    setEditForm({ nome: u.nome, email: u.email, role: u.role, telefone: u.telefone ?? '', senha: '' });
    setError(null);
  };

  const salvarEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        nome: editForm.nome,
        email: editForm.email,
        role: editForm.role,
        telefone: editForm.telefone || null,
      };
      if (editForm.senha) payload.senha = editForm.senha;
      await api.patch(url(`/${editId}`), payload);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const desativar = async (id: string) => {
    if (!confirm('Desativar este acesso?')) return;
    try {
      await api.delete(url(`/${id}`));
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro');
    }
  };

  const reativar = async (u: Usuario) => {
    await api.patch(url(`/${u.id}`), { ativo: true });
    await load();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={criar} className="card space-y-3">
        <h2 className="font-semibold text-slate-800">Novo acesso</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </div>
          <div>
            <label className="label">E-mail *</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Senha inicial *</label>
            <input className="input" type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required minLength={6} placeholder="mín. 6 caracteres" />
          </div>
          <div>
            <label className="label">Telefone (opcional)</label>
            <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </div>
          <div>
            <label className="label">Papel *</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>
        {error && !editId && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Criando…' : 'Criar acesso'}</button>
      </form>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs">
            <tr><th className="py-2">Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((u) => (
              editId === u.id ? (
                <tr key={u.id} className="border-t border-slate-100">
                  <td colSpan={5} className="py-3">
                    <form onSubmit={salvarEdit} className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="font-medium text-slate-700">Editando: {u.nome}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="label">Nome</label><input className="input" value={editForm.nome} onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })} required /></div>
                        <div><label className="label">E-mail</label><input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required /></div>
                        <div><label className="label">Telefone</label><input className="input" value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} /></div>
                        <div>
                          <label className="label">Papel</label>
                          <select className="input" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}>
                            {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        </div>
                        <div><label className="label">Nova senha (deixe vazio pra não mudar)</label><input className="input" type="text" value={editForm.senha} onChange={(e) => setEditForm({ ...editForm, senha: e.target.value })} minLength={6} /></div>
                      </div>
                      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
                        <button type="button" onClick={() => setEditId(null)} className="btn-secondary">Cancelar</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className={`border-t border-slate-100 ${u.ativo ? '' : 'opacity-50'}`}>
                  <td className="py-2">{u.nome}{u.id === meuId && <span className="text-xs text-slate-400 ml-1">(você)</span>}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td><span className="badge bg-slate-100 text-slate-600">{ROLE_LABEL[u.role]}</span></td>
                  <td>{u.ativo ? <span className="badge bg-emerald-50 text-emerald-700">Ativo</span> : <span className="badge bg-slate-100 text-slate-500">Inativo</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => startEdit(u)} className="text-xs text-brand-600 hover:text-brand-800 mr-3">Editar</button>
                    {u.ativo
                      ? <button onClick={() => desativar(u.id)} className="text-xs text-red-500 hover:text-red-700">Desativar</button>
                      : <button onClick={() => reativar(u)} className="text-xs text-emerald-600 hover:text-emerald-800">Reativar</button>}
                  </td>
                </tr>
              )
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Nenhum usuário.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
