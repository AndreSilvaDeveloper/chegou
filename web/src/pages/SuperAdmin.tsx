import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface TenantRow {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  plano: string;
  ativo: boolean;
  qtdUsuarios: number;
  createdAt: string;
}

export function SuperAdmin() {
  const [list, setList] = useState<TenantRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    slug: '',
    cnpj: '',
    cidade: '',
    estado: '',
    sindicoNome: '',
    sindicoEmail: '',
    sindicoSenha: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<TenantRow[]>('/admin/tenants').then(setList);

  useEffect(() => { load(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/tenants', {
        nome: form.nome,
        slug: form.slug,
        cnpj: form.cnpj || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
        sindicoNome: form.sindicoNome,
        sindicoEmail: form.sindicoEmail,
        sindicoSenha: form.sindicoSenha,
      });
      setShowForm(false);
      setForm({ nome: '', slug: '', cnpj: '', cidade: '', estado: '', sindicoNome: '', sindicoEmail: '', sindicoSenha: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await api.patch(`/admin/tenants/${id}`, { ativo: !ativo });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Condomínios</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancelar' : '+ Novo condomínio'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card space-y-3">
          <h2 className="font-semibold text-slate-800">Novo condomínio + síndico inicial</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nome do condomínio *</label>
              <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div>
              <label className="label">Slug (URL) *</label>
              <input className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required placeholder="residencial-aurora" />
            </div>
            <div>
              <label className="label">CNPJ (só números)</label>
              <input className="input font-mono" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '') })} maxLength={14} />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input className="input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div>
              <label className="label">UF</label>
              <input className="input uppercase" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} maxLength={2} />
            </div>
          </div>
          <hr className="border-slate-100" />
          <h3 className="font-medium text-slate-700 text-sm">Síndico inicial</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.sindicoNome} onChange={(e) => setForm({ ...form, sindicoNome: e.target.value })} required />
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input className="input" type="email" value={form.sindicoEmail} onChange={(e) => setForm({ ...form, sindicoEmail: e.target.value })} required />
            </div>
            <div>
              <label className="label">Senha inicial *</label>
              <input className="input" type="password" value={form.sindicoSenha} onChange={(e) => setForm({ ...form, sindicoSenha: e.target.value })} required minLength={6} />
            </div>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Criando…' : 'Criar condomínio'}
          </button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs">
            <tr>
              <th className="py-2">Nome</th>
              <th>Slug</th>
              <th>Cidade/UF</th>
              <th>Usuários</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2 font-medium">{t.nome}</td>
                <td className="font-mono text-xs text-slate-500">{t.slug}</td>
                <td className="text-slate-600">{[t.cidade, t.estado].filter(Boolean).join('/') || '—'}</td>
                <td className="text-slate-600">{t.qtdUsuarios}</td>
                <td>
                  <span className={`badge ${t.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="text-right whitespace-nowrap">
                  <Link to={`/admin/condominios/${t.id}`} className="text-xs text-brand-600 hover:text-brand-800 mr-3">Gerenciar</Link>
                  <button onClick={() => toggleAtivo(t.id, t.ativo)} className="text-xs text-slate-500 hover:text-slate-800">
                    {t.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-slate-500">Nenhum condomínio.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
