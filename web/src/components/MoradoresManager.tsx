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
import { Plus, User, Users, Pencil, Trash2, Loader2, ArrowUpDown, MessageSquare, Star, Upload, QrCode, Building2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ListCard } from '@/components/ui/list-card';
import { PageShell } from '@/components/ui/page-shell';
import { SimpleSelect } from '@/components/ui/simple-select';
import { ImportDialog } from './ImportDialog';
import { QrAutocadastroDialog } from './QrAutocadastroDialog';
import { PhoneInput } from '@/components/ui/phone-input';
import { SearchSelect } from '@/components/ui/search-select';
import { apenasDigitos, formatarTelefone } from '@/lib/telefone';
import { mensagemErro } from '@/lib/erros';
import { useDebounce } from '@/hooks';

/** Mesmo teto do backend: acima disso a lista vem cortada e a busca resolve. */
const LIMITE_APTOS = 50;

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

export function MoradoresManager({
  basePath = '',
  embutido = false,
}: {
  basePath?: string;
  /** Dentro de uma aba: sem faixa âmbar e sem título (ver `PageShell`). */
  embutido?: boolean;
}) {
  const [list, setList] = useState<Morador[]>([]);
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [buscaApto, setBuscaApto] = useState('');
  const [aptoDoEditado, setAptoDoEditado] = useState<{ value: string; label: string } | null>(null);
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
      setList(await api.get<Morador[]>(mUrl('')));
    } catch (err) {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [basePath]);

  // A lista de apartamentos é buscada no servidor conforme se digita: num
  // condomínio grande ela não cabe de uma vez (o backend corta em 50).
  const buscaDebounced = useDebounce(buscaApto, 250);
  useEffect(() => {
    const termo = buscaDebounced.trim();
    const query = termo ? `?q=${encodeURIComponent(termo)}` : '';
    api
      .get<Apartamento[]>(`${basePath}/apartamentos${query}`)
      .then(setAptos)
      .catch(() => toast.error('Erro ao carregar apartamentos'));
  }, [buscaDebounced, basePath]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setAptoDoEditado(null);
    setOpenForm(true);
  };

  /** Opções do select: o que veio da busca + o apartamento atual do morador. */
  const opcoesApartamento = useMemo(() => {
    const daBusca = aptos.map((a) => ({
      value: a.id,
      label: a.identificador,
      hint: a.bloco ? `Bloco ${a.bloco}` : undefined,
      // Casa a busca com o bloco sem depender do texto da dica.
      busca: a.bloco ?? undefined,
    }));
    if (aptoDoEditado && !daBusca.some((o) => o.value === aptoDoEditado.value)) {
      return [aptoDoEditado, ...daBusca];
    }
    return daBusca;
  }, [aptos, aptoDoEditado]);

  const openEdit = (m: Morador) => {
    setEditId(m.id);
    // A lista de apartamentos vem cortada/filtrada; o apartamento atual do
    // morador precisa aparecer no select mesmo que não esteja nela.
    setAptoDoEditado(
      m.apartamento ? { value: m.apartamentoId, label: m.apartamento.identificador } : null,
    );
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
    telefoneE164: f.telefoneE164,
    documento: f.documento || null,
    email: f.email || null,
    principal: f.principal,
    receberWhatsapp: f.receberWhatsapp,
  });

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    // Nome, apartamento e telefone são obrigatórios: sem telefone o morador não
    // fica sabendo que a encomenda chegou, que é o produto inteiro.
    if (!form.nome.trim()) {
      toast.error('Informe o nome do morador');
      return;
    }
    if (!form.apartamentoId) {
      toast.error('Escolha o apartamento');
      return;
    }
    if (!form.telefoneE164 || apenasDigitos(form.telefoneE164).length < 12) {
      toast.error('Informe o telefone com DDD, ex: (32) 99999-9999');
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
      toast.error(mensagemErro(err, 'Erro ao salvar morador'));
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
  // O autocadastro roda nas rotas do condomínio em uso (@TenantId). Fora dele
  // — a tela do superadmin, que reaproveita este manager com basePath — a rota
  // não existe, então o botão não aparece.
  const [openQr, setOpenQr] = useState(false);
  const permiteAutocadastro = basePath === '';

  // Filtros da gaveta (ver `PageShell`). Agem sobre o que já está carregado.
  const [filtroBloco, setFiltroBloco] = useState<string | null>(null);
  const [filtroWhatsapp, setFiltroWhatsapp] = useState<boolean | null>(null);

  const blocos = useMemo(
    () =>
      [
        ...new Set(
          list.map((m) => m.apartamento?.bloco).filter((b): b is string => !!b),
        ),
      ].sort(),
    [list],
  );

  const filteredData = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter(m => {
      if (filtroBloco && m.apartamento?.bloco !== filtroBloco) return false;
      if (filtroWhatsapp !== null && m.receberWhatsapp !== filtroWhatsapp) return false;
      if (!q) return true;
      return (
        m.nome.toLowerCase().includes(q) ||
        (m.apartamento?.identificador.toLowerCase().includes(q)) ||
        // Compara só dígitos: quem busca digita "32999" ou "(32) 99999".
        (!!m.telefoneE164 && apenasDigitos(m.telefoneE164).includes(apenasDigitos(q)) && !!apenasDigitos(q))
      );
    });
  }, [list, search, filtroBloco, filtroWhatsapp]);

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
            <span className="font-semibold txt-corpo">{m.nome}</span>
            {m.principal && <Badge variant="secondary" className="ml-2 txt-nota py-0 h-5"><Star className="mr-1 h-3 w-3 text-amber-500 fill-amber-500" /> Principal</Badge>}
          </div>
        );
      },
    },
    {
      accessorKey: "apartamentoId",
      header: "Apto",
      cell: ({ row }) => {
        const apto = row.original.apartamento?.identificador;
        return apto ? <Badge variant="outline" className="font-mono txt-corpo">{apto}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: "telefoneE164",
      header: "Telefone",
      cell: ({ row }) => (
        <span className="font-mono text-muted-foreground">
          {formatarTelefone(row.original.telefoneE164)}
        </span>
      ),
    },
    {
      accessorKey: "receberWhatsapp",
      header: "Notificação",
      cell: ({ row }) => row.original.receberWhatsapp ? (
        <Badge variant="success">
          <MessageSquare className="mr-1 h-3 w-3" /> WhatsApp
        </Badge>
      ) : <span className="text-muted-foreground txt-apoio">Não recebe</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
              <Pencil className="h-4 w-4 text-primary" />
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
    <PageShell
      embutido={embutido}
      icon={Users}
      eyebrow="Condomínio"
      title="Moradores"
      description="Quem mora no condomínio e por onde recebe as notificações."
      busca={{
        valor: search,
        aoMudar: setSearch,
        placeholder: 'Buscar por nome, apto ou telefone…',
      }}
      filtrosAtivos={(filtroBloco ? 1 : 0) + (filtroWhatsapp !== null ? 1 : 0)}
      aoLimparFiltros={() => {
        setFiltroBloco(null);
        setFiltroWhatsapp(null);
      }}
      filtros={
        <>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="filtro-whatsapp">Notificação</Label>
            <SimpleSelect
              id="filtro-whatsapp"
              value={filtroWhatsapp === null ? '' : filtroWhatsapp ? 'sim' : 'nao'}
              onValueChange={(v) => setFiltroWhatsapp(v === '' ? null : v === 'sim')}
              placeholder="Tanto faz"
              options={[
                { value: '', label: 'Tanto faz' },
                { value: 'sim', label: 'Recebe no WhatsApp' },
                { value: 'nao', label: 'Não recebe' },
              ]}
            />
          </div>
        </>
      }
      acoes={
        <>
          {permiteAutocadastro && (
            <Button variant="outline" onClick={() => setOpenQr(true)} className="flex-1 rounded-full sm:flex-none">
              <QrCode className="mr-2 h-4 w-4" />
              Link de autocadastro
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpenImport(true)} className="flex-1 rounded-full sm:flex-none">
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button onClick={openCreate} className="flex-1 rounded-full sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Novo Morador
          </Button>
        </>
      }
    >
      <div className="space-y-4">
      {/* No celular a lista é uma pilha de cards (cada um já é uma superfície);
          no desktop, uma tabela dentro de um card só. */}
      <div className="md:rounded-surface md:border md:border-border-surface md:bg-card md:p-4 md:shadow-panel">
        <DataTable
          columns={columns}
          data={filteredData}
          emptyStateTitle="Nenhum morador encontrado"
          emptyStateDescription="Cadastre moradores para que eles sejam notificados no WhatsApp."
          mobileCard={(m) => (
            <ListCard
              icone={User}
              titulo={m.nome}
              // A unidade é o que confirma de qual morador se trata — sobe para
              // o subtítulo em vez de disputar espaço com telefone e status.
              subtitulo={
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono">{m.apartamento?.identificador ?? '—'}</span>
                </span>
              }
              selo={
                m.principal ? (
                  <Badge variant="secondary" className="shrink-0 txt-nota">
                    <Star className="mr-1 h-3 w-3 fill-amber-500 text-amber-500" /> Principal
                  </Badge>
                ) : undefined
              }
              acoes={
                <>
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar ${m.nome}`} onClick={() => openEdit(m)}>
                    <Pencil className="h-4 w-4 text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remover ${m.nome}`} onClick={() => confirmarDelete(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              }
              campos={[
                {
                  rotulo: 'Telefone',
                  icone: Phone,
                  valor: <span className="font-mono">{formatarTelefone(m.telefoneE164)}</span>,
                },
                {
                  rotulo: 'Notificação',
                  icone: MessageSquare,
                  valor: m.receberWhatsapp ? (
                    <Badge variant="success">
                      <MessageSquare className="mr-1 h-3 w-3" /> Recebe
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Não recebe</Badge>
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
            <DialogTitle>{editId ? 'Editar Morador' : 'Novo Morador'}</DialogTitle>
            <DialogDescription>
              {editId ? 'Altere os dados do morador.' : 'Adicione um novo morador para receber notificações.'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={submitForm} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" placeholder="Nome completo" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} autoFocus required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apartamento">Apartamento *</Label>
                <SearchSelect
                  id="apartamento"
                  value={form.apartamentoId}
                  onValueChange={(v) => setForm({ ...form, apartamentoId: v })}
                  onSearchChange={setBuscaApto}
                  carregando={buscaApto.trim() !== buscaDebounced.trim()}
                  options={opcoesApartamento}
                  placeholder="— Selecione —"
                  searchPlaceholder="Digite o bloco ou o número"
                  rodape={
                    aptos.length >= LIMITE_APTOS
                      ? `Mostrando as ${LIMITE_APTOS} primeiras — digite para filtrar`
                      : undefined
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone WhatsApp *</Label>
                <PhoneInput
                  id="telefone"
                  value={form.telefoneE164}
                  onChange={(e164) => setForm({ ...form, telefoneE164: e164 })}
                />
                <p className="txt-apoio text-muted-foreground">É por aqui que ele recebe o aviso da encomenda.</p>
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
                  <p className="txt-corpo font-medium leading-none">Morador principal</p>
                  <p className="txt-apoio text-muted-foreground">Contato preferencial do apartamento.</p>
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
                  <p className="txt-corpo font-medium leading-none">Notificações por WhatsApp</p>
                  <p className="txt-apoio text-muted-foreground">Receberá mensagens quando encomendas chegarem.</p>
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

      {permiteAutocadastro && (
        <QrAutocadastroDialog open={openQr} onOpenChange={setOpenQr} />
      )}
      </div>
    </PageShell>
  );
}
