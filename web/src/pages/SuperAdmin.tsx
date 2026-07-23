import { FormEvent, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Search, Plus, Building2, MapPin, Users, Power, PowerOff, ArrowUpDown, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

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
  const [, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: '', slug: '', cnpj: '', cidade: '', estado: '',
    sindicoNome: '', sindicoEmail: '', sindicoSenha: '',
  });
  const [saving, setSaving] = useState(false);

  const [openToggle, setOpenToggle] = useState(false);
  const [togglingTenant, setTogglingTenant] = useState<TenantRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<TenantRow[]>('/admin/tenants');
      setList(data);
    } catch (err) {
      toast.error('Erro ao carregar condomínios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
      toast.success('Condomínio criado com sucesso!');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar condomínio');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!togglingTenant) return;
    try {
      await api.patch(`/admin/tenants/${togglingTenant.id}`, { ativo: !togglingTenant.ativo });
      toast.success(togglingTenant.ativo ? 'Condomínio desativado' : 'Condomínio ativado');
      setOpenToggle(false);
      load();
    } catch (err) {
      toast.error('Erro ao alterar status do condomínio');
    }
  };

  const filteredData = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(t => 
      t.nome.toLowerCase().includes(q) || 
      t.slug.toLowerCase().includes(q) ||
      (t.cidade && t.cidade.toLowerCase().includes(q))
    );
  }, [list, search]);

  const columns: ColumnDef<TenantRow>[] = [
    {
      accessorKey: "nome",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-ml-4">
            Condomínio
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-base">{t.nome}</div>
              <div className="font-mono text-xs text-muted-foreground">{t.slug}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "local",
      header: "Localização",
      cell: ({ row }) => {
        const t = row.original;
        if (!t.cidade && !t.estado) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[150px]">{[t.cidade, t.estado].filter(Boolean).join('/')}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "qtdUsuarios",
      header: "Usuários",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.qtdUsuarios}</span>
        </div>
      ),
    },
    {
      accessorKey: "ativo",
      header: "Status",
      cell: ({ row }) => row.original.ativo ? (
        <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-200">Ativo</Badge>
      ) : (
        <Badge variant="secondary">Inativo</Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Link to={`/admin/condominios/${t.id}`}>
              <Button variant="outline" size="sm" type="button">
                Gerenciar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => { setTogglingTenant(t); setOpenToggle(true); }}>
              {t.ativo ? (
                <PowerOff className="h-4 w-4 text-destructive" />
              ) : (
                <Power className="h-4 w-4 text-emerald-600" />
              )}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="Gestão de Condomínios" 
        description="Área administrativa para gerenciar todos os condomínios da plataforma."
      />

      <Card className="p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, slug ou cidade..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={() => setShowForm(true)} className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Novo Condomínio
          </Button>
        </div>

        <DataTable 
          columns={columns} 
          data={filteredData} 
          emptyStateTitle="Nenhum condomínio encontrado"
          emptyStateDescription="Cadastre o primeiro condomínio na plataforma."
        />
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Condomínio</DialogTitle>
            <DialogDescription>
              Crie um novo ambiente de condomínio e o seu síndico inicial.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={submit} className="space-y-6 pt-2">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Dados do Condomínio
              </h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input id="nome" placeholder="Residencial Aurora" value={form.nome} onChange={e => {
                    const nome = e.target.value;
                    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    setForm(prev => ({...prev, nome, slug: prev.slug || slug}));
                  }} autoFocus required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL) *</Label>
                  <Input id="slug" className="font-mono text-sm" placeholder="residencial-aurora" value={form.slug} onChange={e => setForm({...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} required />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ (Opcional)</Label>
                  <Input id="cnpj" className="font-mono text-sm" placeholder="Apenas números" value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value.replace(/\D/g, '')})} maxLength={14} />
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input id="cidade" placeholder="São Paulo" value={form.cidade} onChange={e => setForm({...form, cidade: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estado">UF</Label>
                    <Input id="estado" className="uppercase" placeholder="SP" value={form.estado} onChange={e => setForm({...form, estado: e.target.value.toUpperCase()})} maxLength={2} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Síndico Inicial
              </h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sindicoNome">Nome Completo *</Label>
                  <Input id="sindicoNome" placeholder="Nome do síndico" value={form.sindicoNome} onChange={e => setForm({...form, sindicoNome: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sindicoEmail">E-mail de Acesso *</Label>
                  <Input id="sindicoEmail" type="email" placeholder="sindico@exemplo.com" value={form.sindicoEmail} onChange={e => setForm({...form, sindicoEmail: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sindicoSenha">Senha Inicial *</Label>
                  <Input id="sindicoSenha" type="password" placeholder="mín. 6 caracteres" value={form.sindicoSenha} onChange={e => setForm({...form, sindicoSenha: e.target.value})} minLength={6} required />
                </div>
              </div>
            </div>
            
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Condomínio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openToggle}
        onOpenChange={setOpenToggle}
        title={togglingTenant?.ativo ? 'Desativar Condomínio' : 'Ativar Condomínio'}
        description={togglingTenant?.ativo 
          ? `Tem certeza? O condomínio "${togglingTenant?.nome}" e todos os seus usuários perderão o acesso ao sistema imediatamente.`
          : `Tem certeza? O condomínio "${togglingTenant?.nome}" voltará a ter acesso ao sistema.`}
        confirmLabel={togglingTenant?.ativo ? 'Desativar' : 'Ativar'}
        variant={togglingTenant?.ativo ? 'destructive' : 'default'}
        onConfirm={handleToggle}
      />
    </div>
  );
}
