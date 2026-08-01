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
import { Plus, User, Users, Pencil, PowerOff, Power, Loader2, ArrowUpDown, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/ui/list-card';
import { PageShell } from '@/components/ui/page-shell';
import { SimpleSelect } from '@/components/ui/simple-select';
import { PhoneInput } from '@/components/ui/phone-input';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administrador',
  porteiro: 'Porteiro',
};

const ROLE_COLOR: Record<UserRole, string> = {
  superadmin: 'bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400',
  sindico: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  admin: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30 dark:text-indigo-400',
  porteiro: 'bg-muted text-muted-foreground border-border',
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
  embutido = false,
}: {
  basePath?: string;
  allowedRoles?: UserRole[];
  /** Dentro de uma aba: sem faixa âmbar e sem título (ver `PageShell`). */
  embutido?: boolean;
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

  // Filtros da gaveta (ver `PageShell`).
  const [filtroPapel, setFiltroPapel] = useState<UserRole | null>(null);
  const [filtroAtivo, setFiltroAtivo] = useState<boolean | null>(null);

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(u => {
      if (filtroPapel && u.role !== filtroPapel) return false;
      if (filtroAtivo !== null && u.ativo !== filtroAtivo) return false;
      if (!q) return true;
      return (
        u.nome.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_LABEL[u.role].toLowerCase().includes(q)
      );
    });
  }, [list, search, filtroPapel, filtroAtivo]);

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
              <span className={`font-semibold txt-corpo ${!u.ativo &&'text-muted-foreground'}`}>{u.nome}</span>
              {u.id === meuId && <Badge variant="outline" className="ml-2 txt-nota py-0 h-5">Você</Badge>}
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
        <Badge variant="success">Ativo</Badge>
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
              <Pencil className="h-4 w-4 text-primary" />
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
    <PageShell
      embutido={embutido}
      icon={Users}
      eyebrow="Condomínio"
      title="Equipe"
      description="Os acessos de síndico e porteiro deste condomínio."
      busca={{
        valor: search,
        aoMudar: setSearch,
        placeholder: 'Buscar por nome, e-mail ou papel…',
      }}
      filtrosAtivos={(filtroPapel ? 1 : 0) + (filtroAtivo !== null ? 1 : 0)}
      aoLimparFiltros={() => {
        setFiltroPapel(null);
        setFiltroAtivo(null);
      }}
      filtros={
        <>
          <div className="space-y-2">
            <Label htmlFor="filtro-papel">Papel</Label>
            <SimpleSelect
              id="filtro-papel"
              value={filtroPapel ?? ''}
              onValueChange={(v) => setFiltroPapel((v || null) as UserRole | null)}
              placeholder="Todos os papéis"
              options={[
                { value: '', label: 'Todos os papéis' },
                ...allowedRoles.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="filtro-ativo">Status</Label>
            <SimpleSelect
              id="filtro-ativo"
              value={filtroAtivo === null ? '' : filtroAtivo ? 'ativo' : 'inativo'}
              onValueChange={(v) => setFiltroAtivo(v === '' ? null : v === 'ativo')}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                { value: 'ativo', label: 'Somente ativos' },
                { value: 'inativo', label: 'Somente inativos' },
              ]}
            />
          </div>
        </>
      }
      acoes={
        <Button onClick={openCreate} className="flex-1 rounded-full sm:flex-none">
          <Plus className="mr-2 h-4 w-4" />
          Novo Acesso
        </Button>
      }
    >
      <div className="space-y-4">
      <div className="md:rounded-surface md:border md:border-border-surface md:bg-card md:p-4 md:shadow-panel">
        <DataTable
          columns={columns}
          data={filteredData}
          emptyStateTitle="Nenhum membro encontrado"
          emptyStateDescription="Adicione pessoas à equipe do condomínio."
          mobileCard={(u) => (
            <ListCard
              icone={User}
              titulo={u.nome}
              // O e-mail é o login dele: identifica a pessoa melhor que o nome
              // repetido e sai de baixo, onde era um campo de largura inteira.
              subtitulo={
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{u.email}</span>
                </span>
              }
              atenuado={!u.ativo}
              selo={
                u.id === meuId ? (
                  <Badge variant="outline" className="shrink-0 txt-nota">Você</Badge>
                ) : undefined
              }
              acoes={
                <>
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${u.nome}`} onClick={() => openEdit(u)}>
                    <Pencil className="h-4 w-4 text-primary" />
                  </Button>
                  {u.id !== meuId && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={u.ativo ? `Desativar ${u.nome}` : `Reativar ${u.nome}`}
                      onClick={() => confirmarToggle(u)}
                    >
                      {u.ativo ? (
                        <PowerOff className="h-4 w-4 text-destructive" />
                      ) : (
                        <Power className="h-4 w-4 text-emerald-600" />
                      )}
                    </Button>
                  )}
                </>
              }
              campos={[
                {
                  rotulo: 'Papel',
                  icone: KeyRound,
                  valor: (
                    <Badge
                      variant="outline"
                      className={u.ativo ? ROLE_COLOR[u.role] : 'border-border bg-muted text-muted-foreground'}
                    >
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  ),
                },
                {
                  rotulo: 'Status',
                  icone: u.ativo ? Power : PowerOff,
                  valor: u.ativo ? (
                    <Badge variant="success">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  ),
                },
              ]}
            />
          )}
        />
      </div>

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
                <PhoneInput
                  id="telefone"
                  value={form.telefone}
                  onChange={(e164) => setForm({ ...form, telefone: e164 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Papel de Acesso *</Label>
                <select 
                  id="role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 txt-apoio ring-offset-background file:border-0 file:bg-transparent file: file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </PageShell>
  );
}
