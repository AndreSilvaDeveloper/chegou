import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import type { Vaga, VagaLocacao } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Label } from '@/components/ui/label';
import {
  Car,
  FileText,
  History,
  KeyRound,
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

const FILTRO_LOCACOES = [
  { value: 'vigentes', label: 'Vigentes' },
  { value: 'encerradas', label: 'Encerradas' },
  { value: 'todas', label: 'Todas' },
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
  const [filtroLocacoes, setFiltroLocacoes] = useState('vigentes');
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
            className="w-full sm:w-auto"
          >
            <Tags className="mr-2 h-4 w-4" />
            Tabela de preços
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="vagas" className="min-h-[44px] txt-corpo">
            Vagas ({vagas.length})
          </TabsTrigger>
          <TabsTrigger value="locacoes" className="min-h-[44px] txt-corpo">
            Locações ({vigentes})
          </TabsTrigger>
          <TabsTrigger value="cobrancas" className="min-h-[44px] txt-corpo">
            Cobranças
          </TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------- vagas */}
        <TabsContent value="vagas" className="space-y-4">
          <Button
            onClick={() => setVagaForm({ aberto: true, vaga: null })}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova vaga
          </Button>

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
              {vagas.map((vaga) => {
                const Icone = TIPO_VAGA_ICON[vaga.tipo] ?? Car;
                return (
                  <Card key={vaga.id}>
                    <CardContent className="space-y-4 p-4 md:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {/* Bloco chapado: sem borda e sem sombra. Card já tem as
                              duas coisas — repetir aqui era a caixa dentro da caixa. */}
                          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-primary">
                            <Icone className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="txt-subtitulo font-semibold text-foreground">
                              Vaga {vaga.numero}
                            </p>
                            <p className="txt-apoio text-muted-foreground">
                              {TIPO_VAGA_LABEL[vaga.tipo]}
                            </p>
                          </div>
                        </div>
                        <SituacaoBadge situacao={vaga.situacao} />
                      </div>

                      {/* Rótulo pequeno em cima, valor legível embaixo — a mesma
                          leitura do `ListCard` das outras listas. */}
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                          <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Local</dt>
                          <dd className="mt-0.5 truncate txt-corpo">{vaga.localizacao || 'Não informado'}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Apartamento</dt>
                          <dd className="mt-0.5 truncate txt-corpo">
                            {vaga.apartamento?.identificador ?? 'Vaga do pool'}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-col gap-2 sm:flex-row">
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
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------ locações */}
        <TabsContent value="locacoes" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2 sm:max-w-xs sm:flex-1">
              <Label htmlFor="loc-filtro">
                Mostrar
              </Label>
              <SimpleSelect
                id="loc-filtro"
                value={filtroLocacoes}
                onValueChange={setFiltroLocacoes}
                options={FILTRO_LOCACOES}
              />
            </div>
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
                return (
                  <Card key={locacao.id}>
                    <CardContent className="space-y-4 p-4 md:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="txt-corpo font-semibold text-foreground">
                            Vaga {locacao.vaga?.numero ?? '—'} · {nomeLocatario(locacao)}
                          </p>
                          <p className="txt-apoio text-muted-foreground">
                            {locacao.locatarioTipo === 'externo' ? 'Pessoa externa' : 'Morador'}
                            {contatoLocatario(locacao) ? ` · ${contatoLocatario(locacao)}` : ''}
                          </p>
                        </div>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                          <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Valor mensal</dt>
                          <dd className="mt-0.5 font-mono txt-corpo font-semibold text-foreground">
                            {fmtMoeda(locacao.valorMensal)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Vencimento</dt>
                          <dd className="mt-0.5 font-mono txt-corpo text-foreground">
                            Todo dia {locacao.diaVencimento}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Início</dt>
                          <dd className="mt-0.5 font-mono txt-corpo text-foreground">
                            {fmtData(locacao.dataInicio)}
                          </dd>
                        </div>
                        {encerrada && (
                          <div className="min-w-0">
                            <dt className="txt-nota uppercase tracking-wide text-muted-foreground">Encerrada em</dt>
                            <dd className="mt-0.5 font-mono txt-corpo text-foreground">
                              {fmtData(locacao.dataFim)}
                            </dd>
                          </div>
                        )}
                      </dl>

                      <div className="flex flex-col gap-2 sm:flex-row">
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
                      </div>
                    </CardContent>
                  </Card>
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
