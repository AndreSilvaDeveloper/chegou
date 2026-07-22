import { FormEvent, useEffect, useState, useMemo } from 'react';
import { api, getUser } from '../api/client';
import { Usuario, UserRole } from '../api/types';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Search, Plus, User, Pencil, PowerOff, Power, Loader2, ArrowUpDown, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administrador',
  porteiro: 'Porteiro',
};

const ROLE_COLOR: Record<UserRole, string> = {
  superadmin: 'bg-red-100 text-red-800 border-red-200',
  sindico: 'bg-amber-100 text-amber-800 border-amber-200',
  admin: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  porteiro: 'bg-slate-100 text-slate-800 border-slate-200',
};

interface UsuarioForm {
  nome: string;
  email: string;
  senha?: string;
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
  const [, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const emptyForm: UsuarioForm = { nome: '', email: '', senha: '', role: allowedRoles[0], telefone: '' };
  const [form, setForm] = useState<UsuarioForm>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog de Desativar/Reativar
  const [openToggle, setOpenToggle] = useState(false);
  const [togglingUser, setTogglingUser] = useState<Usuario | null>(null);

  const url = (p: string) => `${basePath}/usuarios${p}`;
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Usuario[]>(url(''));
      setList(data);
    } catch (err) {
      toast.error('Erro ao carregar equipe');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [basePath]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpenForm(true);
  };

  const openEdit = (u: Usuario) => {
    setEditId(u.id);
    setForm({ nome: u.nome, email: u.email, role: u.role, telefone: u.telefone ?? '', senha: '' });
    setOpenForm(true);
  };

  const confirmarToggle = (u: Usuario) => {
    setTogglingUser(u);
    setOpenToggle(true);
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        const payload: Record<string, unknown> = {
          nome: form.nome,
          email: form.email,
          role: form.role,
          telefone: form.telefone || null,
        };
        if (form.senha) payload.senha = form.senha;
        await api.patch(url(`/${editId}`), payload);
        toast.success('Membro da equipe atualizado!');
      } else {
        await api.post(url(''), {
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          role: form.role,
          telefone: form.telefone || undefined,
        });
        toast.success('Membro da equipe criado!');
      }
      setOpenForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar membro');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!togglingUser) return;
    try {
      if (togglingUser.ativo) {
        await api.delete(url(`/${togglingUser.id}`));
        toast.success('Acesso desativado com sucesso');
      } else {
        await api.patch(url(`/${togglingUser.id}`), { ativo: true });
        toast.success('Acesso reativado com sucesso');
      }
      setOpenToggle(false);
      load();
    } catch (err) {
      toast.error('Erro ao alterar status do acesso');
    }
  };

  const filteredData = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(u => 
      u.nome.toLowerCase().includes(q) || 
      u.email.toLowerCase().includes(q) ||
      ROLE_LABEL[u.role].toLowerCase().includes(q)
    );
  }, [list, search]);

  const columns: ColumnDef<Usuario>[] = [
    {
      accessorKey: "nome",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-ml-4">
            Membro
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className={`font-semibold text-base ${!u.ativo && 'text-muted-foreground'}`}>{u.nome}</span>
              {u.id === meuId && <Badge variant="outline" className="ml-2 text-xs py-0 h-5">Você</Badge>}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: "E-mail",
      cell: ({ row }) => <span className={!row.original.ativo ? 'text-muted-foreground' : ''}>{row.original.email}</span>,
    },
    {
      accessorKey: "role",
      header: "Papel",
      cell: ({ row }) => (
        <Badge variant="outline" className={row.original.ativo ? ROLE_COLOR[row.original.role] : 'bg-muted text-muted-foreground border-border'}>
          {ROLE_LABEL[row.original.role]}
        </Badge>
      ),
    },
    {
      accessorKey: "ativo",
      header: "Status",
      cell: ({ row }) => row.original.ativo ? (
        <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200">Ativo</Badge>
      ) : (
        <Badge variant="secondary">Inativo</Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const u = row.original;
        const isMe = u.id === meuId;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
              <Pencil className="h-4 w-4 text-brand-600" />
            </Button>
            {!isMe && (
              <Button variant="ghost" size="icon" onClick={() => confirmarToggle(u)}>
                {u.ativo ? (
                  <PowerOff className="h-4 w-4 text-destructive" />
                ) : (
                  <Power className="h-4 w-4 text-emerald-600" />
                )}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, e-mail ou papel..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 h-10"
          />
        </div>
        <Button onClick={openCreate} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Acesso
        </Button>
      </div>

      <DataTable 
        columns={columns} 
        data={filteredData} 
        emptyStateTitle="Nenhum membro encontrado"
        emptyStateDescription="Adicione pessoas à equipe do condomínio."
      />

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Acesso' : 'Novo Acesso'}</DialogTitle>
            <DialogDescription>
              {editId ? 'Altere os dados de acesso do membro da equipe.' : 'Crie um acesso para um membro da equipe gerenciar o condomínio.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={submitForm} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Nome completo" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone (Opcional)</Label>
                <Input id="telefone" className="font-mono text-sm" placeholder="+5511988887777" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Papel de Acesso *</Label>
                <select 
                  id="role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.role} 
                  onChange={e => setForm({...form, role: e.target.value as UserRole})} 
                  required
                >
                  {allowedRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
              <Label htmlFor="senha" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                {editId ? 'Nova Senha (deixe vazio para não alterar)' : 'Senha de Acesso *'}
              </Label>
              <Input 
                id="senha" 
                type="text" 
                placeholder={editId ? "••••••••" : "mín. 6 caracteres"} 
                value={form.senha} 
                onChange={e => setForm({...form, senha: e.target.value})} 
                required={!editId} 
                minLength={6} 
              />
            </div>
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? 'Salvar Alterações' : 'Criar Acesso'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openToggle}
        onOpenChange={setOpenToggle}
        title={togglingUser?.ativo ? 'Desativar Acesso' : 'Reativar Acesso'}
        description={togglingUser?.ativo ? 'Tem certeza? Este usuário perderá imediatamente o acesso ao sistema.' : 'Tem certeza? O usuário voltará a ter acesso ao sistema usando a última senha configurada.'}
        confirmLabel={togglingUser?.ativo ? 'Desativar' : 'Reativar'}
        variant={togglingUser?.ativo ? 'destructive' : 'default'}
        onConfirm={handleToggle}
      />
    </Card>
  );
}
