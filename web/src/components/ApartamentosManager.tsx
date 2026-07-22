import { FormEvent, useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { Apartamento } from '../api/types';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Search, Plus, Building2, Pencil, Trash2, Loader2, ArrowUpDown, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ImportDialog } from './ImportDialog';

export function ApartamentosManager({ basePath = '' }: { basePath?: string }) {
  const [list, setList] = useState<Apartamento[]>([]);
  const [, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dialog de Criação/Edição
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ bloco: '', numero: '', observacoes: '' });

  // Dialog de Exclusão
  const [openDelete, setOpenDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const url = (p: string) => `${basePath}/apartamentos${p}`;
  
  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<Apartamento[]>(url(''));
      setList(data);
    } catch (err) {
      toast.error('Erro ao carregar apartamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [basePath]);

  const openCreate = () => {
    setEditId(null);
    setForm({ bloco: '', numero: '', observacoes: '' });
    setOpenForm(true);
  };

  const openEdit = (a: Apartamento) => {
    setEditId(a.id);
    setForm({ bloco: a.bloco ?? '', numero: a.numero, observacoes: a.observacoes ?? '' });
    setOpenForm(true);
  };

  const confirmarDelete = (id: string) => {
    setDeletingId(id);
    setOpenDelete(true);
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.numero.trim()) {
      toast.error('O número é obrigatório');
      return;
    }
    
    setSaving(true);
    try {
      if (editId) {
        await api.patch(url(`/${editId}`), {
          bloco: form.bloco || null,
          numero: form.numero,
          observacoes: form.observacoes || null,
        });
        toast.success('Apartamento atualizado!');
      } else {
        await api.post(url(''), { 
          bloco: form.bloco || undefined, 
          numero: form.numero, 
          observacoes: form.observacoes || undefined 
        });
        toast.success('Apartamento adicionado!');
      }
      setOpenForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar apartamento');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.delete(url(`/${deletingId}`));
      toast.success('Apartamento desativado com sucesso');
      setOpenDelete(false);
      load();
    } catch (err) {
      toast.error('Erro ao desativar apartamento');
    }
  };

  // Import CSV
  const [openImport, setOpenImport] = useState(false);

  const filteredData = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(a => 
      a.identificador.toLowerCase().includes(q) || 
      (a.observacoes && a.observacoes.toLowerCase().includes(q))
    );
  }, [list, search]);

  const columns: ColumnDef<Apartamento>[] = [
    {
      accessorKey: "identificador",
      header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} className="-ml-4">
            Unidade
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono font-semibold text-base">{a.identificador}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "bloco",
      header: "Bloco",
      cell: ({ row }) => row.original.bloco ? <Badge variant="outline">{row.original.bloco}</Badge> : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "numero",
      header: "Número",
    },
    {
      accessorKey: "observacoes",
      header: "Observações",
      cell: ({ row }) => <span className="text-muted-foreground truncate max-w-[200px] block">{row.original.observacoes || '—'}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
              <Pencil className="h-4 w-4 text-brand-600" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => confirmarDelete(a.id)}>
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
            placeholder="Buscar unidade..." 
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
            Novo Apartamento
          </Button>
        </div>
      </div>

      <DataTable 
        columns={columns} 
        data={filteredData} 
        emptyStateTitle="Nenhum apartamento encontrado"
        emptyStateDescription="Adicione apartamentos para que eles recebam encomendas."
      />

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Apartamento' : 'Novo Apartamento'}</DialogTitle>
            <DialogDescription>
              {editId ? 'Altere os dados da unidade.' : 'Cadastre uma nova unidade no condomínio.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={submitForm} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bloco">Bloco (Opcional)</Label>
                <Input id="bloco" placeholder="Ex: A" value={form.bloco} onChange={e => setForm({...form, bloco: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número *</Label>
                <Input id="numero" placeholder="Ex: 101" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} autoFocus required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (Opcional)</Label>
              <Input id="observacoes" placeholder="Informações adicionais" value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} />
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
        title="Desativar Apartamento"
        description="Tem certeza? Os moradores associados a este apartamento ficarão sem apartamento ativo."
        confirmLabel="Desativar"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        type="apartamentos"
        onSuccess={load}
      />
    </Card>
  );
}
