import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageShell } from '@/components/ui/page-shell';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CondominioWizard } from '@/components/condominio/CondominioWizard';
import { Search, Plus, Building2, MapPin, Users, Power, PowerOff, ArrowUpDown, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { municipioLinha } from '@/lib/endereco';

interface TenantRow {
  id: string;
  nome: string;
  slug: string;
  documento: string | null;
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
              <div className="font-semibold txt-corpo">{t.nome}</div>
              <div className="font-mono txt-apoio text-muted-foreground">{t.slug}</div>
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
          <div className="flex items-center gap-1.5 txt-corpo">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[150px]">{municipioLinha(t)}</span>
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
        <Badge variant="success">Ativo</Badge>
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
    <PageShell
      icon={Building2}
      eyebrow="Plataforma"
      title="Gestão de Condomínios"
      description="Área administrativa para gerenciar todos os condomínios da plataforma."
    >
      <div className="space-y-6">

      <Card className="p-4 shadow-xs">
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

      <CondominioWizard
        open={showForm}
        onOpenChange={setShowForm}
        endpoint="/admin/tenants"
        onCriado={load}
      />

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
    </PageShell>
  );
}
