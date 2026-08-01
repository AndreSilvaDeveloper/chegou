import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import type { Vaga, VagaLocacao } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ListCard } from '@/components/ui/list-card';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Car,
  FileText,
  History,
  KeyRound,
  MapPin,
  Wallet,
  Pencil,
  Plus,
  Receipt,
  SquareParking,
  Tags,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { CobrancasPanel } from '@/components/vagas/CobrancasPanel';
import { ContratoDialog } from '@/components/vagas/ContratoDialog';
import { HistoricoVagaDialog } from '@/components/vagas/HistoricoVagaDialog';
import { LocacaoFormDialog } from '@/components/vagas/LocacaoFormDialog';
import { PrecosDialog } from '@/components/vagas/PrecosDialog';
import { VagaFormDialog } from '@/components/vagas/VagaFormDialog';
import {
  contatoLocatario,
  fmtData,
  fmtMoeda,
  nomeLocatario,
  SituacaoBadge,
  STATUS_LOCACAO_META,
  TIPO_VAGA_ICON,
  TIPO_VAGA_LABEL,
} from '@/components/vagas/vagas-shared';

type Aba = 'vagas' | 'locacoes' | 'cobrancas';

type FiltroLocacao = 'vigentes' | 'encerradas' | 'todas';

const FILTRO_LOCACOES: OpcaoSegmento<FiltroLocacao>[] = [
  { valor: 'vigentes', label: 'Vigentes' },
  { valor: 'encerradas', label: 'Encerradas' },
  { valor: 'todas', label: 'Todas' },
];

export function Vagas() {
  const [aba, setAba] = useState<Aba>('vagas');
  const [precosAberto, setPrecosAberto] = useState(false);
  const [vagaForm, setVagaForm] = useState<{ aberto: boolean; vaga: Vaga | null }>({
    aberto: false,
    vaga: null,
  });
  const [locacaoForm, setLocacaoForm] = useState<{ aberto: boolean; locacao: VagaLocacao | null }>({
    aberto: false,
    locacao: null,
  });
  const [contrato, setContrato] = useState<VagaLocacao | null>(null);
  const [historicoVaga, setHistoricoVaga] = useState<Vaga | null>(null);
  const [encerrando, setEncerrando] = useState<VagaLocacao | null>(null);
  const [filtroLocacoes, setFiltroLocacoes] = useState<FiltroLocacao>('vigentes');
  const queryClient = useQueryClient();

  const vagasQuery = useQuery({
    queryKey: ['vagas'],
    queryFn: () => api.get<Vaga[]>('/vagas'),
  });

  const locacoesQuery = useQuery({
    queryKey: ['vagas-locacao'],
    queryFn: () => api.get<VagaLocacao[]>('/vagas-locacao'),
  });

  const encerrar = useMutation({
    mutationFn: (id: string) => api.post<VagaLocacao>(`/vagas-locacao/${id}/encerrar`),
    onSuccess: () => {
      toast.success('Locação encerrada. A vaga voltou a ficar livre.');
      queryClient.invalidateQueries({ queryKey: ['vagas'] });
      queryClient.invalidateQueries({ queryKey: ['vagas-locacao'] });
      queryClient.invalidateQueries({ queryKey: ['vagas-disponiveis'] });
      setEncerrando(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível encerrar a locação');
    },
  });

  const vagas = vagasQuery.data ?? [];
  const locacoes = useMemo(() => {
    const todas = locacoesQuery.data ?? [];
    if (filtroLocacoes === 'encerradas') return todas.filter((l) => l.status === 'encerrada');
    if (filtroLocacoes === 'vigentes') return todas.filter((l) => l.status !== 'encerrada');
    return todas;
  }, [locacoesQuery.data, filtroLocacoes]);

  const vigentes = (locacoesQuery.data ?? []).filter((l) => l.status !== 'encerrada').length;
  const livres = vagas.filter((v) => v.alugavel).length;

  return (
    <PageShell
      icon={SquareParking}
      eyebrow="Garagem"
      title="Vagas"
      description={`${vagas.length} vaga(s) cadastrada(s) · ${livres} livre(s) para locação`}
      acoes={
        <>
          <Button
            variant="outline"
            onClick={() => setPrecosAberto(true)}
            className="flex-1 rounded-full sm:flex-none"
          >
            <Tags className="mr-2 h-4 w-4" />
            Tabela de preços
          </Button>
          <Button
            onClick={() => setVagaForm({ aberto: true, vaga: null })}
            className="flex-1 rounded-full sm:flex-none"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova vaga
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="vagas">
            Vagas <span className="tabular txt-nota text-muted-foreground">{vagas.length}</span>
          </TabsTrigger>
          <TabsTrigger value="locacoes">
            Locações <span className="tabular txt-nota text-muted-foreground">{vigentes}</span>
          </TabsTrigger>
          <TabsTrigger value="cobrancas">Cobranças</TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------- vagas */}
        <TabsContent value="vagas" className="space-y-4">
          

          {vagasQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[168px] rounded-xl" />
              ))}
            </div>
          ) : vagas.length === 0 ? (
            <EmptyState
              icon={Car}
              title="Nenhuma vaga cadastrada"
              description="Cadastre as vagas da garagem para vincular a apartamentos ou alugar."
              actionLabel="Cadastrar primeira vaga"
              onAction={() => setVagaForm({ aberto: true, vaga: null })}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {/* Mesmo card das outras listas (`ListCard`) — aqui ele já nasce
                  em grade no desktop, e as ações com texto vão no rodapé. */}
              {vagas.map((vaga) => (
                <ListCard
                  key={vaga.id}
                  icone={TIPO_VAGA_ICON[vaga.tipo] ?? Car}
                  titulo={`Vaga ${vaga.numero}`}
                  subtitulo={TIPO_VAGA_LABEL[vaga.tipo]}
                  selo={<SituacaoBadge situacao={vaga.situacao} />}
                  campos={[
                    {
                      rotulo: 'Local',
                      icone: MapPin,
                      valor: vaga.localizacao || 'Não informado',
                    },
                    {
                      rotulo: 'Apartamento',
                      icone: Building2,
                      valor: vaga.apartamento?.identificador ?? 'Vaga do pool',
                    },
                  ]}
                  rodape={
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setVagaForm({ aberto: true, vaga })}
                        className="w-full"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar vaga
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setHistoricoVaga(vaga)}
                        className="w-full"
                      >
                        <History className="mr-2 h-4 w-4" />
                        Histórico
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------ locações */}
        <TabsContent value="locacoes" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Filtro, não aba: a lista é a mesma, muda o recorte. Mesma pele
                do trilho de abas acima — é o que amarra a identidade da tela. */}
            <SegmentedFilter
              aria="Filtrar locações por situação"
              valor={filtroLocacoes}
              aoMudar={setFiltroLocacoes}
              opcoes={FILTRO_LOCACOES}
            />
            <Button
              onClick={() => setLocacaoForm({ aberto: true, locacao: null })}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova locação
            </Button>
          </div>

          {locacoesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[220px] rounded-xl" />
              ))}
            </div>
          ) : locacoes.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="Nenhuma locação por aqui"
              description="Alugue uma vaga livre para um morador ou para alguém de fora do condomínio."
              actionLabel="Criar locação"
              onAction={() => setLocacaoForm({ aberto: true, locacao: null })}
            />
          ) : (
            <div className="space-y-3">
              {locacoes.map((locacao) => {
                const meta = STATUS_LOCACAO_META[locacao.status];
                const encerrada = locacao.status === 'encerrada';
                const contato = contatoLocatario(locacao);
                return (
                  <ListCard
                    key={locacao.id}
                    icone={KeyRound}
                    titulo={nomeLocatario(locacao)}
                    subtitulo={[
                      `Vaga ${locacao.vaga?.numero ?? '—'}`,
                      locacao.locatarioTipo === 'externo' ? 'Pessoa externa' : 'Morador',
                      contato,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    selo={<Badge variant={meta.variant}>{meta.label}</Badge>}
                    campos={[
                      {
                        rotulo: 'Valor mensal',
                        icone: Wallet,
                        // O dado que a tela existe para mostrar — único com ênfase.
                        enfase: true,
                        valor: <span className="font-mono">{fmtMoeda(locacao.valorMensal)}</span>,
                      },
                      {
                        rotulo: 'Vencimento',
                        icone: CalendarClock,
                        valor: <span className="font-mono">Todo dia {locacao.diaVencimento}</span>,
                      },
                      {
                        rotulo: 'Início',
                        icone: CalendarDays,
                        valor: <span className="font-mono">{fmtData(locacao.dataInicio)}</span>,
                      },
                      ...(encerrada
                        ? [
                            {
                              rotulo: 'Encerrada em',
                              icone: CalendarOff,
                              valor: <span className="font-mono">{fmtData(locacao.dataFim)}</span>,
                            },
                          ]
                        : []),
                    ]}
                    rodape={
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setContrato(locacao)}
                          className="w-full sm:w-auto"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          {locacao.contratoUrl ? 'Ver contrato' : 'Anexar contrato'}
                        </Button>
                        {!encerrada && (
                          <>
                            <Button
                              variant="outline"
                              onClick={() => setLocacaoForm({ aberto: true, locacao })}
                              className="w-full sm:w-auto"
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setEncerrando(locacao)}
                              className="w-full text-red-600 hover:text-red-600 dark:text-red-400 sm:w-auto"
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Encerrar
                            </Button>
                          </>
                        )}
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------- cobranças */}
        <TabsContent value="cobrancas" className="space-y-4">
          {vigentes === 0 && !locacoesQuery.isLoading ? (
            <EmptyState
              icon={Receipt}
              title="Sem locações para cobrar"
              description="As cobranças são geradas a partir das locações vigentes. Crie uma locação primeiro."
              actionLabel="Criar locação"
              onAction={() => {
                setAba('locacoes');
                setLocacaoForm({ aberto: true, locacao: null });
              }}
            />
          ) : (
            <CobrancasPanel />
          )}
        </TabsContent>
      </Tabs>

      <PrecosDialog open={precosAberto} onOpenChange={setPrecosAberto} />

      <HistoricoVagaDialog
        vaga={historicoVaga}
        onOpenChange={(aberto) => !aberto && setHistoricoVaga(null)}
      />

      <VagaFormDialog
        open={vagaForm.aberto}
        onOpenChange={(aberto) => setVagaForm((f) => ({ ...f, aberto }))}
        vaga={vagaForm.vaga}
      />

      <LocacaoFormDialog
        open={locacaoForm.aberto}
        onOpenChange={(aberto) => setLocacaoForm((f) => ({ ...f, aberto }))}
        locacao={locacaoForm.locacao}
      />

      <ContratoDialog
        open={!!contrato}
        onOpenChange={(aberto) => !aberto && setContrato(null)}
        locacao={contrato}
      />

      <ConfirmDialog
        open={!!encerrando}
        onOpenChange={(aberto) => !aberto && setEncerrando(null)}
        title="Encerrar esta locação?"
        description={
          encerrando
            ? `Vaga ${encerrando.vaga?.numero ?? '—'} de ${nomeLocatario(encerrando)}. A vaga volta para o pool de locação e não são geradas novas cobranças.`
            : ''
        }
        confirmLabel="Encerrar locação"
        cancelLabel="Voltar"
        variant="destructive"
        loading={encerrar.isPending}
        onConfirm={() => encerrando && encerrar.mutate(encerrando.id)}
      />
      </div>
    </PageShell>
  );
}
