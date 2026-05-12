import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Tenant } from '../api/types';
import { ApartamentosManager } from '../components/ApartamentosManager';
import { MoradoresManager } from '../components/MoradoresManager';
import { EquipeManager } from '../components/EquipeManager';

type Tab = 'dados' | 'apartamentos' | 'moradores' | 'equipe';

export function SuperAdminTenant() {
  const { id } = useParams<{ id: string }>();
  const base = `/admin/tenants/${id}`;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>('dados');
  const [form, setForm] = useState({ nome: '', slug: '', cnpj: '', cidade: '', estado: '', plano: '', ativo: true });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get<Tenant>(`/admin/tenants/${id}`).then((t) => {
      setTenant(t);
      setForm({
        nome: t.nome, slug: t.slug, cnpj: t.cnpj ?? '', cidade: t.cidade ?? '',
        estado: t.estado ?? '', plano: t.plano, ativo: t.ativo,
      });
    });

  useEffect(() => { load(); }, [id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await api.patch(`/admin/tenants/${id}`, {
        nome: form.nome,
        slug: form.slug,
        cnpj: form.cnpj || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        plano: form.plano,
        ativo: form.ativo,
      });
      setMsg('Salvo.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  if (!tenant) return <div className="text-slate-500">Carregando…</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dados', label: 'Dados' },
    { key: 'apartamentos', label: 'Apartamentos' },
    { key: 'moradores', label: 'Moradores' },
    { key: 'equipe', label: 'Equipe' },
  ];

  return (
    <div className="space-y-4">
      <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-800">← Condomínios</Link>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">{tenant.nome}</h1>
        <span className={`badge ${tenant.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {tenant.ativo ? 'Ativo' : 'Inativo'}
        </span>
        <span className="font-mono text-xs text-slate-400">{tenant.slug}</span>
      </div>

      <div className="flex gap-1 text-sm border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dados' && (
        <form onSubmit={salvar} className="card space-y-3">
          <h2 className="font-semibold text-slate-800">Dados do condomínio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Nome *</label><input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
            <div><label className="label">Slug (URL) *</label><input className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required /></div>
            <div><label className="label">CNPJ (só números)</label><input className="input font-mono" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '') })} maxLength={14} /></div>
            <div><label className="label">Cidade</label><input className="input" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
            <div><label className="label">UF</label><input className="input uppercase" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} /></div>
            <div><label className="label">Plano</label><input className="input" value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            Condomínio ativo (se desmarcar, ninguém deste condomínio consegue usar o sistema)
          </label>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{msg}</div>}
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
        </form>
      )}

      {tab === 'apartamentos' && <ApartamentosManager basePath={base} />}
      {tab === 'moradores' && <MoradoresManager basePath={base} />}
      {tab === 'equipe' && <EquipeManager basePath={base} allowedRoles={['porteiro', 'sindico', 'admin']} />}
    </div>
  );
}
