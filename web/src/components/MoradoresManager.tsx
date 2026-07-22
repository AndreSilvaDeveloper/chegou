import { FormEvent, useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { Apartamento, Morador } from '../api/types';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Search, Plus, User, Pencil, Trash2, Loader2, ArrowUpDown, MessageSquare, Star, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ImportDialog } from './ImportDialog';

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
  const [, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dialog de Criação/Edição
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<MoradorForm>(emptyForm);

  // Dialog de Exclusão
  const [openDelete, setOpenDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const mUrl = (p: string) => `${basePath}/moradores${p}`;
  
  const load = async () => {
    setLoading(true);
    try {
      const [mData, aData] = await Promise.all([
        api.get<Morador[]>(mUrl('')),
        api.get<Apartamento[]>(`${basePath}/apartamentos`)
      ]);
      setList(mData);
      setAptos(aData);
    } catch (err) {
      toast.error('Erro ao carregar dados');
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

  const openEdit = (m: Morador) => {
    setEditId(m.id);
    setForm({
      apartamentoId: m.apartamentoId,
      nome: m.nome,
      telefoneE164: m.telefoneE164 ?? '',
      documento: m.documento ?? '',
      email: m.email ?? '',
      principal: m.principal,
      receberWhatsapp: m.receberWhatsapp,
    });
    setOpenForm(true);
  };

  const confirmarDelete = (id: string) => {
    setDeletingId(id);
    setOpenDelete(true);
  };

  const toPayload = (f: MoradorForm) => ({
    apartamentoId: f.apartamentoId,
    nome: f.nome,
    telefoneE164: f.telefoneE164 || null,
    documento: f.documento || null,
    email: f.email || null,
    principal: f.principal,
    receberWhatsapp: f.receberWhatsapp,
  });

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.apartamentoId) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editId) {
        await api.patch(mUrl(`/${editId}`), payload);
        toast.success('Morador atualizado!');
      } else {
        await api.post(mUrl(''), payload);
        toast.success('Morador adicionado!');
      }
      setOpenForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar morador');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.delete(mUrl(`/${deletingId}`));
      toast.success('Morador desativado com sucesso');
      setOpenDelete(false);
      load();
    } catch (err) {
      toast.error('Erro ao desativar morador');
    }
  };

  // Import CSV
  const [openImport, setOpenImport] = useState(false);

  const filteredData = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(m => 
      m.nome.toLowerCase().includes(q) || 
      (m.apartamento?.identificador.toLowerCase().includes(q)) ||
      (m.telefoneE164 && m.telefoneE164.includes(q))
    );
  }, [list, search]);

  const columns: ColumnDef<Morador>[] = [
    {
      accessorKey: "nome",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-ml-4">
            Morador
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-base">{m.nome}</span>
            {m.principal && <Badge variant="secondary" className="ml-2 text-xs py-0 h-5"><Star className="mr-1 h-3 w-3 text-amber-500 fill-amber-500" /> Principal</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: "apartamentoId",
      header: "Apto",
      cell: ({ row }) => {
        const apto = row.original.apartamento?.identificador;
        return apto ? <Badge variant="outline" className="font-mono text-base">{apto}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: "telefoneE164",
      header: "Telefone",
      cell: ({ row }) => row.original.telefoneE164 ? <span className="font-mono text-muted-foreground">{row.original.telefoneE164}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "receberWhatsapp",
      header: "Notificação",
      cell: ({ row }) => row.original.receberWhatsapp ? (
        <Badge variant="success" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200">
          <MessageSquare className="mr-1 h-3 w-3" /> WhatsApp
        </Badge>
      ) : <span className="text-muted-foreground text-sm">Não recebe</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
              <Pencil className="h-4 w-4 text-brand-600" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => confirmarDelete(m.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
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
            placeholder="Buscar por nome, apto ou telefone..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 h-10"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" onClick={() => setOpenImport(true)} className="w-full md:w-auto">
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={openCreate} className="w-full md:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Novo Morador
          </Button>
        </div>
      </div>

      <DataTable 
        columns={columns} 
        data={filteredData} 
        emptyStateTitle="Nenhum morador encontrado"
        emptyStateDescription="Cadastre moradores para que eles sejam notificados no WhatsApp."
      />

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Morador' : 'Novo Morador'}</DialogTitle>
            <DialogDescription>
              {editId ? 'Altere os dados do morador.' : 'Adicione um novo morador para receber notificações.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={submitForm} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Nome completo" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apartamento">Apartamento *</Label>
                <select 
                  id="apartamento"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.apartamentoId} 
                  onChange={e => setForm({...form, apartamentoId: e.target.value})} 
                  required
                >
                  <option value="">— Selecione —</option>
                  {aptos.map((a) => <option key={a.id} value={a.id}>{a.identificador}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone WhatsApp</Label>
                <Input id="telefone" className="font-mono text-sm" placeholder="+5511988887777" value={form.telefoneE164} onChange={e => setForm({...form, telefoneE164: e.target.value})} />
                <p className="text-[11px] text-muted-foreground">Formato internacional (Ex: +55...)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="documento">Documento (Opcional)</Label>
                <Input id="documento" placeholder="CPF ou RG" value={form.documento} onChange={e => setForm({...form, documento: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail (Opcional)</Label>
              <Input id="email" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>

            <div className="flex flex-col gap-3 pt-2 pb-2 rounded-lg bg-muted/50 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary" 
                  checked={form.principal} 
                  onChange={e => setForm({...form, principal: e.target.checked})} 
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Morador principal</p>
                  <p className="text-xs text-muted-foreground">Contato preferencial do apartamento.</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary" 
                  checked={form.receberWhatsapp} 
                  onChange={e => setForm({...form, receberWhatsapp: e.target.checked})} 
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Notificações por WhatsApp</p>
                  <p className="text-xs text-muted-foreground">Receberá mensagens quando encomendas chegarem.</p>
                </div>
              </label>
            </div>
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? 'Salvar Alterações' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={openDelete}
        onOpenChange={setOpenDelete}
        title="Desativar Morador"
        description="Tem certeza? O morador não receberá mais notificações."
        confirmLabel="Desativar"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        type="moradores"
        onSuccess={load}
      />
    </Card>
  );
}
