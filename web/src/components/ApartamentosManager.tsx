import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { Plus, Building2, Pencil, Trash2, Loader2, ArrowUpDown, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/ui/list-card';
import { PageShell } from '@/components/ui/page-shell';
import { SimpleSelect } from '@/components/ui/simple-select';
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
  embutido = false,
}: {
  basePath?: string;
  /** Mostra as vagas da unidade — exige módulo Vagas e perfil que gerencia vagas. */
  permiteVagas?: boolean;
  /** Dentro de uma aba: sem faixa âmbar e sem título (ver `PageShell`). */
  embutido?: boolean;
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

  // Filtro por bloco (gaveta do `PageShell`). Fica no cliente de propósito: os
  // blocos são poucos e já vieram na lista, então filtrar aqui não perde nada —
  // ao contrário da BUSCA, que precisa ir ao servidor por causa do corte em 50.
  const [filtroBloco, setFiltroBloco] = useState<string | null>(null);

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

  // Blocos existentes, para a gaveta de filtro.
  const blocos = useMemo(
    () => [...new Set(list.map((a) => a.bloco).filter((b): b is string => !!b))].sort(),
    [list],
  );

  const listaFiltrada = useMemo(
    () => (filtroBloco ? list.filter((a) => a.bloco === filtroBloco) : list),
    [list, filtroBloco],
  );

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
    <PageShell
      embutido={embutido}
      icon={Building2}
      eyebrow="Condomínio"
      title="Apartamentos"
      description="Unidades do condomínio e as vagas que pertencem a elas."
      busca={{
        valor: search,
        aoMudar: setSearch,
        placeholder: 'Buscar apartamentos…',
      }}
      filtrosAtivos={filtroBloco ? 1 : 0}
      aoLimparFiltros={() => setFiltroBloco(null)}
      filtros={
        usaBloco ? (
          <div className="space-y-2">
            <Label htmlFor="filtro-bloco">Bloco</Label>
            <SimpleSelect
              id="filtro-bloco"
              value={filtroBloco ?? ''}
              onValueChange={(v) => setFiltroBloco(v || null)}
              placeholder="Todos os blocos"
              options={[
                { value: '', label: 'Todos os blocos' },
                ...blocos.map((b) => ({ value: b, label: `Bloco ${b}` })),
              ]}
            />
            <p className="txt-nota text-muted-foreground">
              O filtro age sobre as unidades já carregadas; a busca é que procura no
              condomínio inteiro.
            </p>
          </div>
        ) : undefined
      }
      acoes={
        <>
          <Button variant="outline" onClick={() => setOpenImport(true)} className="flex-1 rounded-full sm:flex-none">
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={openCreate} className="flex-1 rounded-full sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Novo Apartamento
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          {total !== null && (
            <p className="txt-apoio text-muted-foreground">
              <span className="font-semibold text-foreground">{total}</span>{' '}
              {total === 1 ? 'unidade cadastrada' : 'unidades cadastradas'}
              {!search.trim() && total > LIMITE_LISTAGEM && (
                <> · mostrando as primeiras {LIMITE_LISTAGEM} — use a busca para encontrar as demais</>
              )}
            </p>
          )}

          <div className="md:rounded-surface md:border md:border-border-surface md:bg-card md:p-4 md:shadow-panel">
          <DataTable
            columns={columns}
            data={listaFiltrada}
            emptyStateTitle="Nenhum apartamento encontrado"
            emptyStateDescription="Adicione apartamentos para que eles recebam encomendas."
            mobileCard={(a) => (
              <ListCard
                icone={Building2}
                titulo={<span className="font-mono">{a.identificador}</span>}
                selo={a.bloco ? <Badge variant="outline" className="shrink-0">{a.bloco}</Badge> : undefined}
                acoes={
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar unidade ${a.identificador}`} onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remover unidade ${a.identificador}`} onClick={() => confirmarDelete(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                }
                campos={[
                  { rotulo: 'Bloco', valor: a.bloco || '—' },
                  { rotulo: 'Número', valor: <span className="font-mono">{a.numero}</span> },
                  ...(a.observacoes
                    ? [{ rotulo: 'Observações', valor: a.observacoes, largura: 'inteira' as const }]
                    : []),
                ]}
              />
            )}
          />
          </div>

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
      </div>
    </PageShell>
  );
}
