import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Tenant } from '../api/types';
import { ApartamentosManager } from '../components/ApartamentosManager';
import { MoradoresManager } from '../components/MoradoresManager';
import { EquipeManager } from '../components/EquipeManager';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Building2, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Tab = 'dados' | 'apartamentos' | 'moradores' | 'equipe';

export function SuperAdminTenant() {
  const { id } = useParams<{ id: string }>();
  const base = `/admin/tenants/${id}`;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>('dados');
  
  const [form, setForm] = useState({ 
    nome: '', slug: '', cnpj: '', cidade: '', estado: '', plano: '', ativo: true 
  });
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get<Tenant>(`/admin/tenants/${id}`).then((t) => {
      setTenant(t);
      setForm({
        nome: t.nome, slug: t.slug, cnpj: t.cnpj ?? '', cidade: t.cidade ?? '',
        estado: t.estado ?? '', plano: t.plano, ativo: t.ativo,
      });
    }).catch(() => toast.error('Condomínio não encontrado'));

  useEffect(() => { load(); }, [id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
      toast.success('Dados salvos com sucesso!');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar condomínio');
    } finally {
      setSaving(false);
    }
  };

  if (!tenant) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Carregando informações...</p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dados', label: 'Dados Gerais' },
    { key: 'apartamentos', label: 'Apartamentos' },
    { key: 'moradores', label: 'Moradores' },
    { key: 'equipe', label: 'Equipe e Acessos' },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-4 mb-4">
        <Link to="/admin">
          <Button variant="ghost" size="icon" className="rounded-full" type="button">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader 
          title={tenant.nome}
          description="Gerenciamento do ambiente do condomínio."
          className="mb-0 border-0 pb-0"
        >
          <div className="flex gap-2">
            <Badge variant={tenant.ativo ? 'success' : 'secondary'} className={tenant.ativo ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : ''}>
              {tenant.ativo ? 'Ativo' : 'Inativo'}
            </Badge>
            <Badge variant="outline" className="font-mono text-muted-foreground">{tenant.slug}</Badge>
          </div>
        </PageHeader>
      </div>

      {/* Tabs navigation */}
      <div className="flex overflow-x-auto rounded-xl border bg-card p-1 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              tab === t.key 
                ? "bg-primary text-primary-foreground shadow" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'dados' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Informações do Condomínio</CardTitle>
              <CardDescription>
                Atualize os dados básicos de identificação deste ambiente.
              </CardDescription>
            </CardHeader>
            <form onSubmit={salvar}>
              <CardContent className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome do Condomínio *</Label>
                    <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <Input id="slug" className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input id="cnpj" className="font-mono" placeholder="Apenas números" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '') })} maxLength={14} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plano">Plano da Assinatura</Label>
                    <Input id="plano" value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="cidade" className="pl-9" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado (UF)</Label>
                    <Input id="estado" className="uppercase" placeholder="SP" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
                  </div>
                </div>

                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 mt-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary" 
                      checked={form.ativo} 
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })} 
                    />
                    <div>
                      <p className="font-medium text-destructive">Permitir Acesso (Condomínio Ativo)</p>
                      <p className="text-sm text-destructive/80 mt-1">Se você desmarcar esta opção, TODOS os usuários deste condomínio perderão acesso imediato ao sistema.</p>
                    </div>
                  </label>
                </div>

              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex justify-between">
                <p className="text-sm text-muted-foreground">Última alteração não registrada.</p>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Alterações
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {tab === 'apartamentos' && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <ApartamentosManager basePath={base} />
          </div>
        )}
        
        {tab === 'moradores' && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <MoradoresManager basePath={base} />
          </div>
        )}
        
        {tab === 'equipe' && (
          <div className="animate-in fade-in zoom-in-95 duration-200">
            <EquipeManager basePath={base} allowedRoles={['porteiro', 'sindico', 'admin']} />
          </div>
        )}
      </div>
    </div>
  );
}
