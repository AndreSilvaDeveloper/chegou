import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { Apartamento } from '../api/types';
import { useDebounce } from '@/hooks';
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
import { mensagemErro } from '@/lib/erros';
import {
  VagasDoApartamento,
  VAGAS_VAZIO,
  type VagasSelecionadas,
} from './apartamentos/VagasDoApartamento';

/** Como o condomínio organiza as unidades (vem de `config_json`). */
type EstruturaBlocos = 'unico' | 'multiplos';

/** Mesmo teto do backend: acima disso a lista vem cortada e a busca resolve. */
const LIMITE_LISTAGEM = 50;

export function ApartamentosManager({
  basePath = '',
  permiteVagas = false,
}: {
  basePath?: string;
  /** Mostra as vagas da unidade — exige módulo Vagas e perfil que gerencia vagas. */
  permiteVagas?: boolean;
}) {
  const [list, setList] = useState<Apartamento[]>([]);
  const [, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Total de unidades do condomínio, independente do corte da listagem.
  const [total, setTotal] = useState<number | null>(null);

  // Estrutura do condomínio decide se o campo bloco existe e se é obrigatório.
  const [estrutura, setEstrutura] = useState<EstruturaBlocos>('multiplos');
  const usaBloco = estrutura === 'multiplos';

  // Dialog de Criação/Edição
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ bloco: '', numero: '', observacoes: '' });
  const [vagas, setVagas] = useState<VagasSelecionadas>(VAGAS_VAZIO);

  // Dialog de Exclusão
  const [openDelete, setOpenDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const url = (p: string) => `${basePath}/apartamentos${p}`;
  
  // Busca no SERVIDOR (não no cliente): a lista vem cortada em 50, então filtrar
  // localmente só enxergaria as 50 primeiras — era o que fazia "501" não achar
  // uma unidade que existe. O backend casa por número/bloco/identificador.
  const load = async (termo = '') => {
    setLoading(true);
    try {
      const query = termo.trim() ? `?q=${encodeURIComponent(termo.trim())}` : '';
      setList(await api.get<Apartamento[]>(url(query)));
    } catch (err) {
      toast.error('Erro ao carregar apartamentos');
    } finally {
      setLoading(false);
    }
  };

  const carregarTotal = async () => {
    try {
      const r = await api.get<{ total: number }>(url('/count'));
      setTotal(r.total);
    } catch {
      setTotal(null);
    }
  };

  const carregarEstrutura = async () => {
    try {
      const r = await api.get<{ estruturaBlocos: EstruturaBlocos }>(url('/estrutura'));
      setEstrutura(r.estruturaBlocos);
    } catch {
      // Sem a config, o formulário segue no modo mais permissivo (com bloco).
      setEstrutura('multiplos');
    }
  };

  useEffect(() => { carregarEstrutura(); carregarTotal(); }, [basePath]);

  // Recarrega a lista do servidor a cada busca (com debounce) e ao trocar de condomínio.
  const buscaDebounced = useDebounce(search, 300);
  useEffect(() => { load(buscaDebounced); }, [buscaDebounced, basePath]);

  const openCreate = () => {
    setEditId(null);
    setForm({ bloco: '', numero: '', observacoes: '' });
    setVagas(VAGAS_VAZIO);
    setOpenForm(true);
  };

  const openEdit = (a: Apartamento) => {
    setEditId(a.id);
    setForm({ bloco: a.bloco ?? '', numero: a.numero, observacoes: a.observacoes ?? '' });
    setVagas(VAGAS_VAZIO);
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
    if (usaBloco && !form.bloco.trim()) {
      toast.error('Informe o bloco da unidade');
      return;
    }

    // Bloco só viaja quando o condomínio tem blocos. Na edição de dado legado
    // (condomínio virou bloco único depois), o valor atual segue junto para o
    // backend saber que não é um bloco novo.
    const bloco = usaBloco ? form.bloco.trim() : form.bloco.trim() || null;

    setSaving(true);
    try {
      if (editId) {
        await api.patch(url(`/${editId}`), {
          bloco,
          numero: form.numero,
          observacoes: form.observacoes || null,
        });
        toast.success('Apartamento atualizado!');
      } else {
        const temVagas = vagas.novasVagas.length > 0 || vagas.vagasExistentesIds.length > 0;
        await api.post(url(''), {
          bloco: bloco || undefined,
          numero: form.numero,
          observacoes: form.observacoes || undefined,
          ...(permiteVagas && temVagas ? { vagas } : {}),
        });
        toast.success(temVagas ? 'Apartamento e vagas cadastrados!' : 'Apartamento adicionado!');
      }
      setOpenForm(false);
      load(search);
      carregarTotal();
    } catch (err) {
      toast.error(mensagemErro(err, 'Erro ao salvar apartamento'));
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
      load(search);
      carregarTotal();
    } catch (err) {
      toast.error('Erro ao desativar apartamento');
    }
  };

  // Import CSV
  const [openImport, setOpenImport] = useState(false);

  const aposImportar = () => {
    load(search);
    carregarTotal();
  };

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
            <span className="font-mono font-semibold txt-corpo">{a.identificador}</span>
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
              <Pencil className="h-4 w-4 text-primary" />
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
    <Card className="p-4 shadow-xs">
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
        <div className="flex flex-col gap-2 w-full sm:flex-row md:w-auto">
          <Button variant="outline" onClick={() => setOpenImport(true)} className="w-full sm:w-auto">
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Novo Apartamento
          </Button>
        </div>
      </div>

      {total !== null && (
        <p className="mb-3 txt-apoio text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span>{' '}
          {total === 1 ? 'unidade cadastrada' : 'unidades cadastradas'}
          {!search.trim() && total > LIMITE_LISTAGEM && (
            <> · mostrando as primeiras {LIMITE_LISTAGEM} — use a busca para encontrar as demais</>
          )}
        </p>
      )}

      <DataTable
        columns={columns}
        data={list}
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
            <div className={usaBloco ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'space-y-2'}>
              {/* Condomínio de bloco único não tem bloco para informar. */}
              {usaBloco && (
                <div className="space-y-2">
                  <Label htmlFor="bloco">Bloco *</Label>
                  <Input id="bloco" placeholder="Ex: A" value={form.bloco} onChange={e => setForm({...form, bloco: e.target.value})} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="numero">Número *</Label>
                <Input id="numero" placeholder="Ex: 101" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} autoFocus required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações (Opcional)</Label>
              <Input id="observacoes" placeholder="Informações adicionais" value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} />
            </div>

            {permiteVagas && (
              <VagasDoApartamento
                apartamentoId={editId}
                valor={editId ? undefined : vagas}
                onChange={setVagas}
              />
            )}

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
        onSuccess={aposImportar}
      />
    </Card>
  );
}
