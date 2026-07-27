import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  CirclePlus,
  Receipt,
  Table2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import type {
  AssinaturaFatura,
  AssinaturaFaixa,
  PreviaAssinatura,
  ResultadoGeracaoFaturas,
  ResumoAssinatura,
} from '@/api/types';
import { ComoFoiCalculado, StatusFaturaBadge } from '@/components/assinatura/assinatura-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mensagemErro } from '@/lib/erros';
import { competenciaAnterior, fmtCompetencia, fmtData, fmtMoeda } from '@/lib/formato';

type Aba = 'faturas' | 'previas' | 'precos';

const FILTROS_STATUS = [
  { value: '', label: 'Todos os status' },
  { value: 'aberta', label: 'Em aberto' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'paga', label: 'Pagas' },
  { value: 'cancelada', label: 'Canceladas' },
];

/**
 * A receita da plataforma — só o superadmin.
 *
 * A competência começa no **mês passado** de propósito: a assinatura é pós-paga,
 * então o que se fatura hoje é o mês que fechou, não o que está correndo.
 */
export function SuperAdminAssinaturas() {
  const [aba, setAba] = useState<Aba>('faturas');
  const [competencia, setCompetencia] = useState(competenciaAnterior());
  const [status, setStatus] = useState('');
  const [gerarAberto, setGerarAberto] = useState(false);
  const [pagando, setPagando] = useState<AssinaturaFatura | null>(null);
  const [cancelando, setCancelando] = useState<AssinaturaFatura | null>(null);
  const queryClient = useQueryClient();

  const resumoQuery = useQuery({
    queryKey: ['assinatura-resumo', competencia],
    queryFn: () => api.get<ResumoAssinatura>(`/admin/assinaturas/resumo?competencia=${competencia}`),
    enabled: !!competencia,
  });

  const faturasQuery = useQuery({
    queryKey: ['assinatura-faturas', competencia, status],
    queryFn: () => {
      const params = new URLSearchParams({ competencia });
      if (status) params.set('status', status);
      return api.get<AssinaturaFatura[]>(`/admin/assinaturas/faturas?${params}`);
    },
    enabled: !!competencia,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['assinatura-faturas'] });
    queryClient.invalidateQueries({ queryKey: ['assinatura-resumo'] });
  };

  const erro = (padrao: string) => (err: unknown) => toast.error(mensagemErro(err, padrao));

  const pagar = useMutation({
    mutationFn: (id: string) => api.post<AssinaturaFatura>(`/admin/assinaturas/faturas/${id}/pagar`, {}),
    onSuccess: () => {
      toast.success('Pagamento registrado.');
      invalidar();
      setPagando(null);
    },
    onError: erro('Não foi possível registrar o pagamento'),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      api.post<AssinaturaFatura>(`/admin/assinaturas/faturas/${id}/cancelar`, {}),
    onSuccess: () => {
      toast.success('Fatura cancelada.');
      invalidar();
      setCancelando(null);
    },
    onError: erro('Não foi possível cancelar a fatura'),
  });

  const resumo = resumoQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Plataforma"
        title="Assinaturas"
        description="O que os clientes pagam pelo Chegou: preços, prévias e faturas do mês."
        icon={Receipt}
      >
        <Button onClick={() => setGerarAberto(true)} className="min-h-[48px]">
          <CirclePlus className="mr-2 h-4 w-4" />
          Gerar faturas
        </Button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resumoQuery.isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            <StatCard
              title="Faturado"
              value={fmtMoeda(resumo?.valorFaturado ?? 0)}
              icon={Wallet}
              variant="primary"
              description={`${resumo?.totalFaturas ?? 0} fatura(s) na competência`}
            />
            <StatCard
              title="Recebido"
              value={fmtMoeda(resumo?.valorRecebido ?? 0)}
              icon={CheckCircle2}
              variant="success"
              description={`${resumo?.pagas ?? 0} paga(s)`}
            />
            <StatCard
              title="Em aberto"
              value={fmtMoeda(resumo?.valorEmAberto ?? 0)}
              icon={Receipt}
              description={`${resumo?.emAberto ?? 0} aguardando`}
            />
            <StatCard
              title="Vencido"
              value={fmtMoeda(resumo?.valorVencido ?? 0)}
              icon={AlertTriangle}
              variant={resumo?.vencidas ? 'danger' : 'default'}
              description={`${resumo?.vencidas ?? 0} fatura(s)`}
            />
          </>
        )}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="faturas" className="min-h-[44px] text-sm">
            Faturas
          </TabsTrigger>
          <TabsTrigger value="previas" className="min-h-[44px] text-sm">
            Prévias
          </TabsTrigger>
          <TabsTrigger value="precos" className="min-h-[44px] text-sm">
            Preços
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faturas" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="competencia" className="text-base">
                Competência
              </Label>
              <Input
                id="competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="min-h-[48px]"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="status" className="text-base">
                Status
              </Label>
              <SimpleSelect
                id="status"
                value={status}
                onValueChange={setStatus}
                options={FILTROS_STATUS}
              />
            </div>
          </div>

          {faturasQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : !faturasQuery.data?.length ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma fatura nesta competência"
              description="Gere as faturas do mês para cobrar os clientes."
              actionLabel="Gerar faturas"
              onAction={() => setGerarAberto(true)}
            />
          ) : (
            <div className="space-y-3">
              {faturasQuery.data.map((fatura) => (
                <FaturaCard
                  key={fatura.id}
                  fatura={fatura}
                  onPagar={() => setPagando(fatura)}
                  onCancelar={() => setCancelando(fatura)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="previas">
          <PainelPrevias />
        </TabsContent>

        <TabsContent value="precos">
          <PainelPrecos />
        </TabsContent>
      </Tabs>

      <GerarFaturasDialog
        open={gerarAberto}
        onOpenChange={setGerarAberto}
        competenciaPadrao={competencia}
        onGerado={(gerada) => {
          setCompetencia(gerada);
          invalidar();
        }}
      />

      <ConfirmDialog
        open={!!pagando}
        onOpenChange={(open) => !open && setPagando(null)}
        title="Registrar pagamento"
        description={
          pagando
            ? `Confirmar o recebimento de ${fmtMoeda(pagando.valor)} de ${pagando.sacado.nome}?`
            : ''
        }
        confirmLabel="Registrar pagamento"
        loading={pagar.isPending}
        onConfirm={() => pagando && pagar.mutate(pagando.id)}
      />

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(open) => !open && setCancelando(null)}
        title="Cancelar fatura"
        description={
          cancelando
            ? `A fatura de ${cancelando.sacado.nome} sai dos totais e não poderá mais ser paga. Isso não pode ser desfeito.`
            : ''
        }
        confirmLabel="Cancelar fatura"
        variant="destructive"
        loading={cancelar.isPending}
        onConfirm={() => cancelando && cancelar.mutate(cancelando.id)}
      />
    </div>
  );
}

function FaturaCard({
  fatura,
  onPagar,
  onCancelar,
}: {
  fatura: AssinaturaFatura;
  onPagar: () => void;
  onCancelar: () => void;
}) {
  const podeMexer = fatura.status === 'aberta' || fatura.status === 'vencida';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{fatura.sacado.nome}</span>
            <StatusFaturaBadge status={fatura.status} />
            {fatura.sacado.tipo === 'administradora' && (
              <span className="text-xs text-muted-foreground">
                carteira · {fatura.itens.length} condomínio(s)
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {fmtCompetencia(fatura.competencia)} · vence em {fmtData(fatura.vencimento)}
          </p>
          <p className="text-xs text-muted-foreground">
            {fatura.quantidadeApartamentos} apartamento
            {fatura.quantidadeApartamentos === 1 ? '' : 's'}
            {fatura.precoAplicado !== null ? ` × ${fmtMoeda(fatura.precoAplicado)}` : ' · valor fixo'}
            {fatura.desconto > 0 ? ` · desconto de ${fmtMoeda(fatura.desconto)}` : ''}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="font-mono text-xl font-bold tabular text-foreground">
            {fmtMoeda(fatura.valor)}
          </span>
          {podeMexer && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={onPagar} className="min-h-[48px]">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Dar baixa
              </Button>
              <Button variant="outline" onClick={onCancelar} className="min-h-[48px]">
                <Ban className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** O que entra se o mês fechar hoje, cliente a cliente. */
function PainelPrevias() {
  const query = useQuery({
    queryKey: ['assinatura-previas'],
    queryFn: () => api.get<PreviaAssinatura[]>('/admin/assinaturas/previas'),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!query.data?.length) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhum cliente ativo"
        description="Condomínios diretos e administradoras aparecem aqui com o valor que pagariam hoje."
      />
    );
  }

  const total = query.data.reduce((soma, p) => soma + p.resultado.valor, 0);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4 md:p-5">
          <div>
            <p className="text-sm font-medium text-foreground">Se o mês fechasse hoje</p>
            <p className="text-sm text-muted-foreground">
              {query.data.length} cliente(s) — condomínios diretos e administradoras
            </p>
          </div>
          <span className="font-mono text-xl font-bold tabular text-foreground">
            {fmtMoeda(total)}
          </span>
        </CardContent>
      </Card>

      {query.data.map((previa) => (
        <Card key={`${previa.sacado.tipo}-${previa.sacado.id}`}>
          <CardContent className="space-y-3 p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{previa.sacado.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {previa.sacado.tipo === 'administradora' ? 'Administradora' : 'Condomínio direto'}
                  {previa.condicao ? ' · preço especial' : ''}
                </p>
              </div>
              <span className="font-mono text-lg font-bold tabular text-foreground">
                {fmtMoeda(previa.resultado.valor)}
              </span>
            </div>
            <ComoFoiCalculado resultado={previa.resultado} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A tabela de preços da plataforma. */
function PainelPrecos() {
  const [editando, setEditando] = useState(false);
  const query = useQuery({
    queryKey: ['assinatura-faixas'],
    queryFn: () => api.get<AssinaturaFaixa[]>('/admin/assinaturas/faixas'),
  });

  if (query.isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Preço por apartamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A faixa é escolhida pela quantidade e o preço dela vale para{' '}
              <strong>todos</strong> os apartamentos — não é escalonado por trecho. Para uma
              administradora, a quantidade é a soma da carteira inteira.
            </p>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border">
            {query.data?.map((faixa) => (
              <li key={faixa.ordem} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm text-foreground">
                  {faixa.ateQuantidade === null
                    ? 'Acima disso'
                    : `Até ${faixa.ateQuantidade} apartamentos`}
                </span>
                <span className="font-mono text-sm tabular text-foreground">
                  {fmtMoeda(faixa.precoApartamento)}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Mudar a tabela vale a partir da próxima geração. Fatura já emitida guarda o preço que
            foi cobrado e não é reescrita.
          </p>

          <Button variant="outline" onClick={() => setEditando(true)} className="min-h-[48px]">
            <Table2 className="mr-2 h-4 w-4" />
            Editar tabela de preços
          </Button>
        </CardContent>
      </Card>

      <EditarFaixasDialog
        open={editando}
        onOpenChange={setEditando}
        faixasAtuais={query.data ?? []}
      />
    </div>
  );
}

interface LinhaFaixa {
  ateQuantidade: string;
  precoApartamento: string;
}

function EditarFaixasDialog({
  open,
  onOpenChange,
  faixasAtuais,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faixasAtuais: AssinaturaFaixa[];
}) {
  const [linhas, setLinhas] = useState<LinhaFaixa[]>([]);
  const queryClient = useQueryClient();

  // Carrega a tabela atual toda vez que o diálogo abre — reabrir depois de
  // desistir não pode manter a edição pela metade.
  const abrir = (aberto: boolean) => {
    if (aberto) {
      setLinhas(
        faixasAtuais.map((f) => ({
          ateQuantidade: f.ateQuantidade === null ? '' : String(f.ateQuantidade),
          precoApartamento: String(f.precoApartamento),
        })),
      );
    }
    onOpenChange(aberto);
  };

  const salvar = useMutation({
    mutationFn: () =>
      api.put<AssinaturaFaixa[]>('/admin/assinaturas/faixas', {
        faixas: linhas.map((linha) => ({
          ateQuantidade: linha.ateQuantidade ? Number(linha.ateQuantidade) : null,
          precoApartamento: Number(linha.precoApartamento),
        })),
      }),
    onSuccess: () => {
      toast.success('Tabela de preços atualizada.');
      queryClient.invalidateQueries({ queryKey: ['assinatura-faixas'] });
      queryClient.invalidateQueries({ queryKey: ['assinatura-previas'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível salvar a tabela')),
  });

  const alterar = (indice: number, campo: keyof LinhaFaixa, valor: string) =>
    setLinhas((atual) =>
      atual.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha)),
    );

  return (
    <FormDialog
      open={open}
      onOpenChange={abrir}
      title="Tabela de preços"
      description="A última faixa fica sem teto — é ela que atende os clientes acima da tabela."
      submitLabel="Salvar tabela"
      saving={salvar.isPending}
      onSubmit={() => salvar.mutate()}
    >
      <div className="space-y-4">
        {linhas.map((linha, i) => {
          const ehUltima = i === linhas.length - 1;
          return (
            <div key={i} className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor={`ate-${i}`} className="text-base">
                  {ehUltima ? 'Acima da faixa anterior' : 'Até quantos apartamentos'}
                </Label>
                <Input
                  id={`ate-${i}`}
                  type="number"
                  min={1}
                  value={linha.ateQuantidade}
                  disabled={ehUltima}
                  placeholder={ehUltima ? 'Sem teto' : ''}
                  onChange={(e) => alterar(i, 'ateQuantidade', e.target.value)}
                  className="min-h-[48px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`preco-${i}`} className="text-base">
                  Preço por apartamento (R$)
                </Label>
                <Input
                  id={`preco-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={linha.precoApartamento}
                  onChange={(e) => alterar(i, 'precoApartamento', e.target.value)}
                  className="min-h-[48px]"
                />
              </div>
            </div>
          );
        })}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-[48px] flex-1"
            onClick={() =>
              // Entra antes da última: a de cima ganha teto, a última segue aberta.
              setLinhas((atual) => [
                ...atual.slice(0, -1),
                { ateQuantidade: '', precoApartamento: '' },
                ...atual.slice(-1),
              ])
            }
          >
            <CirclePlus className="mr-2 h-4 w-4" />
            Adicionar faixa
          </Button>
          {linhas.length > 1 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setLinhas((atual) => [...atual.slice(0, -2), ...atual.slice(-1)])}
            >
              Remover a penúltima
            </Button>
          )}
        </div>
      </div>
    </FormDialog>
  );
}

function GerarFaturasDialog({
  open,
  onOpenChange,
  competenciaPadrao,
  onGerado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competenciaPadrao: string;
  onGerado: (competencia: string) => void;
}) {
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [diaVencimento, setDiaVencimento] = useState('10');

  const gerar = useMutation({
    mutationFn: () =>
      api.post<ResultadoGeracaoFaturas>('/admin/assinaturas/faturas/gerar', {
        competencia,
        diaVencimento: Number(diaVencimento),
      }),
    onSuccess: (r) => {
      const partes = [`${r.criadas} fatura(s) criada(s)`];
      if (r.jaExistiam) partes.push(`${r.jaExistiam} já existiam`);
      toast.success(partes.join(' · '));
      // Cliente que não virou fatura precisa aparecer: silêncio aqui vira
      // "esqueci de cobrar fulano" três meses depois.
      for (const ignorado of r.ignorados.slice(0, 3)) {
        toast.warning(`${ignorado.sacado.nome}: ${ignorado.motivo}`);
      }
      if (r.ignorados.length > 3) {
        toast.warning(`E mais ${r.ignorados.length - 3} cliente(s) sem fatura.`);
      }
      onGerado(competencia);
      onOpenChange(false);
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível gerar as faturas')),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(aberto) => {
        if (aberto) setCompetencia(competenciaPadrao);
        onOpenChange(aberto);
      }}
      title="Gerar faturas do mês"
      description="Uma fatura por cliente. Rodar de novo na mesma competência não duplica."
      submitLabel="Gerar faturas"
      saving={gerar.isPending}
      onSubmit={() => gerar.mutate()}
    >
      <div className="space-y-2">
        <Label htmlFor="gerar-competencia" className="text-base">
          Competência
        </Label>
        <Input
          id="gerar-competencia"
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="min-h-[48px]"
        />
        <p className="text-xs text-muted-foreground">
          A assinatura é pós-paga: fatura-se o mês que fechou.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gerar-vencimento" className="text-base">
          Dia do vencimento
        </Label>
        <Input
          id="gerar-vencimento"
          type="number"
          min={1}
          max={31}
          value={diaVencimento}
          onChange={(e) => setDiaVencimento(e.target.value)}
          className="min-h-[48px]"
        />
        <p className="text-xs text-muted-foreground">
          No mês seguinte à competência. Dia 31 em mês de 30 cai no último dia.
        </p>
      </div>
    </FormDialog>
  );
}
