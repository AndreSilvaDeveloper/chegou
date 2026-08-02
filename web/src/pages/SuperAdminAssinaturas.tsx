import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Briefcase,
  Building2,
  CheckCircle2,
  CirclePlus,
  IdCard,
  PlugZap,
  Receipt,
  RefreshCw,
  ShieldAlert,
  TicketPercent,
  Send,
  Table2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import type {
  AssinaturaFatura,
  AssinaturaFaixa,
  MotivoPendenciaCliente,
  PainelPendencias,
  PendenciaCliente,
  PendenciasDeCobranca,
  PoliticaAcesso,
  Cupom,
  FaturaEmPendencia,
  PreviaAssinatura,
  ResultadoGeracaoFaturas,
  ResultadoConciliacao,
  ResultadoSincronizacao,
  ResumoAssinatura,
  TipoClienteAssinatura,
} from '@/api/types';
import { ComoFoiCalculado, StatusFaturaBadge } from '@/components/assinatura/assinatura-shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListCard } from '@/components/ui/list-card';
import { CheckboxField } from '@/components/ui/checkbox';
import { PageShell } from '@/components/ui/page-shell';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatarDocumento } from '@/lib/documento';
import { mensagemErro } from '@/lib/erros';
import { competenciaAnterior, fmtCompetencia, fmtData, fmtMoeda } from '@/lib/formato';

type Aba = 'faturas' | 'previas' | 'precos' | 'cupons' | 'pendencias';

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

  // A mesma query do painel de Pendências (react-query junta as duas pela
  // chave): aqui ela só alimenta o contador da aba, para o problema aparecer
  // sem que ninguém precise abrir a aba para descobrir que existe.
  const pendenciasQuery = useQuery({
    queryKey: ['assinatura-pendencias'],
    queryFn: () => api.get<PainelPendencias>('/admin/assinaturas/clientes/pendencias'),
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

  const emitir = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean; detalhe?: string }>(
        `/admin/assinaturas/faturas/${id}/emitir-cobranca`,
        {},
      ),
    onSuccess: (resultado) => {
      // Como na sincronização de cliente, a rota responde 200 mesmo falhando:
      // a falha é estado da fatura, não erro da request.
      if (resultado.ok) toast.success('Cobrança emitida.');
      else toast.error(resultado.detalhe ?? 'Não foi possível emitir a cobrança.');
      invalidar();
    },
    onError: erro('Não foi possível emitir a cobrança'),
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
    <PageShell
      eyebrow="Plataforma"
      title="Assinaturas"
      description="O que os clientes pagam pelo Chegou: preços, prévias e faturas do mês."
      icon={Receipt}
      acoes={
        <>
          <Button onClick={() => setGerarAberto(true)} className="flex-1 rounded-full sm:flex-none">
            <CirclePlus className="mr-2 h-4 w-4" />
            Gerar faturas
          </Button>
        </>
      }
    >
      <div className="space-y-6">

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
        <TabsList>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
          <TabsTrigger value="previas">Prévias</TabsTrigger>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
          <TabsTrigger value="pendencias">
            Pendências
            {!!pendenciasQuery.data?.resumo.pendentes && (
              <span className="tabular txt-nota text-muted-foreground">
                {pendenciasQuery.data.resumo.pendentes}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="faturas" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="competencia">
                Competência
              </Label>
              <Input
                id="competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)} />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="status">
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
                  onEmitir={() => emitir.mutate(fatura.id)}
                  emitindo={emitir.isPending && emitir.variables === fatura.id}
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

        <TabsContent value="cupons">
          <PainelCupons />
        </TabsContent>

        <TabsContent value="pendencias">
          <PainelPendenciasClientes />
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
    </PageShell>
  );
}

/**
 * O estado da **emissão** — o que o superadmin precisa saber e o cliente não.
 *
 * Fatura emitida some daqui: quando está tudo certo não há o que dizer, e uma
 * linha verde em toda fatura vira ruído que esconde a única que falhou.
 */
function EstadoDaCobranca({ fatura }: { fatura: AssinaturaFatura }) {
  const status = fatura.cobrancaStatus;

  if (fatura.cobrancaDessincronizada) {
    return (
      <p className="txt-apoio text-amber-600 dark:text-amber-400">
        Baixa registrada aqui e ainda não confirmada no gateway. A conciliação resolve.
      </p>
    );
  }
  if (status === 'erro') {
    return (
      <p className="txt-apoio text-destructive">
        Cobrança não emitida: {fatura.cobrancaErro ?? 'erro desconhecido'}
      </p>
    );
  }
  if (status === 'desligada') {
    return <p className="txt-apoio text-muted-foreground">Cobrança desligada neste ambiente</p>;
  }
  if (status === 'pendente') {
    return <p className="txt-apoio text-muted-foreground">Cobrança na fila de emissão</p>;
  }
  return null;
}

function FaturaCard({
  fatura,
  onPagar,
  onCancelar,
  onEmitir,
  emitindo,
}: {
  fatura: AssinaturaFatura;
  onPagar: () => void;
  onCancelar: () => void;
  onEmitir: () => void;
  emitindo: boolean;
}) {
  const podeMexer = fatura.status === 'aberta' || fatura.status === 'vencida';
  // Só oferece emitir onde a emissão resolve: já emitida não se reemite (o
  // link continua valendo), e desligada não tem gateway para chamar.
  const precisaEmitir = fatura.cobrancaStatus === 'erro' || fatura.cobrancaStatus === 'pendente';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{fatura.sacado.nome}</span>
            <StatusFaturaBadge status={fatura.status} />
            {fatura.sacado.tipo === 'administradora' && (
              <span className="txt-apoio text-muted-foreground">
                carteira · {fatura.itens.length} condomínio(s)
              </span>
            )}
          </div>
          <p className="txt-apoio text-muted-foreground">
            {fmtCompetencia(fatura.competencia)} · vence em {fmtData(fatura.vencimento)}
          </p>
          <p className="txt-apoio text-muted-foreground">
            {fatura.quantidadeApartamentos} apartamento
            {fatura.quantidadeApartamentos === 1 ? '' : 's'}
            {fatura.precoAplicado !== null ? ` × ${fmtMoeda(fatura.precoAplicado)}` : ' · valor fixo'}
            {fatura.desconto > 0 ? ` · desconto de ${fmtMoeda(fatura.desconto)}` : ''}
          </p>
          <EstadoDaCobranca fatura={fatura} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="font-mono txt-numero-sm font-bold tabular text-foreground">
            {fmtMoeda(fatura.valor)}
          </span>
          {podeMexer && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {precisaEmitir && (
                <Button variant="outline" onClick={onEmitir} disabled={emitindo}>
                  <Send className={`mr-2 h-4 w-4 ${emitindo ? 'animate-pulse' : ''}`} />
                  Emitir cobrança
                </Button>
              )}
              <Button onClick={onPagar} >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Dar baixa
              </Button>
              <Button variant="outline" onClick={onCancelar} >
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
            <p className="txt-corpo font-medium text-foreground">Se o mês fechasse hoje</p>
            <p className="txt-apoio text-muted-foreground">
              {query.data.length} cliente(s) — condomínios diretos e administradoras
            </p>
          </div>
          <span className="font-mono txt-numero-sm font-bold tabular text-foreground">
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
                <p className="txt-apoio text-muted-foreground">
                  {previa.sacado.tipo === 'administradora' ? 'Administradora' : 'Condomínio direto'}
                  {previa.condicao ? ' · preço especial' : ''}
                </p>
              </div>
              <span className="font-mono txt-numero-sm font-bold tabular text-foreground">
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

/**
 * Como cada motivo se resolve.
 *
 * `acao` é o que separa esta tela de uma lista de erros: cadastro se conserta no
 * condomínio, sincronização se resolve no botão. Mandar o superadmin clicar em
 * "Sincronizar" num cliente sem CNPJ só produz o mesmo erro de novo — por isso
 * o botão só aparece onde ele resolve alguma coisa.
 */
const MOTIVO_PENDENCIA: Record<
  MotivoPendenciaCliente,
  { rotulo: string; sincronizavel: boolean }
> = {
  sem_documento: { rotulo: 'Sem documento', sincronizavel: false },
  documento_invalido: { rotulo: 'Documento inválido', sincronizavel: false },
  nunca_sincronizado: { rotulo: 'Não enviado', sincronizavel: true },
  erro_sync: { rotulo: 'Erro ao enviar', sincronizavel: true },
  desligada: { rotulo: 'Cobrança desligada', sincronizavel: false },
};

/**
 * Os cupons da plataforma.
 *
 * **O cupom vive no gateway** — esta tela é uma janela sobre os endpoints dele.
 * `usos` e "vale agora" vêm calculados de lá; guardar uma cópia criaria duas
 * fontes da verdade que divergem no primeiro erro de rede.
 *
 * **Não há cupom para o cliente digitar.** Quem concede é o superadmin,
 * atribuindo o cupom a um cliente — como já é com preço especial.
 */
function PainelCupons() {
  const queryClient = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED_AMOUNT',
    discountValue: '',
    maxUsesPerCustomer: '',
  });

  const query = useQuery({
    queryKey: ['assinatura-cupons'],
    queryFn: () => api.get<Cupom[]>('/admin/assinaturas/cupons'),
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['assinatura-cupons'] });

  const criar = useMutation({
    mutationFn: () =>
      api.post<Cupom>('/admin/assinaturas/cupons', {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxUsesPerCustomer: form.maxUsesPerCustomer
          ? Number(form.maxUsesPerCustomer)
          : undefined,
      }),
    onSuccess: () => {
      toast.success('Cupom criado.');
      setCriando(false);
      setForm({ ...form, code: '', description: '', discountValue: '', maxUsesPerCustomer: '' });
      invalidar();
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível criar o cupom')),
  });

  const alternar = useMutation({
    mutationFn: (c: Cupom) =>
      api.post(`/admin/assinaturas/cupons/${c.id}/${c.active ? 'desativar' : 'reativar'}`, {}),
    onSuccess: () => {
      toast.success('Cupom atualizado.');
      invalidar();
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível atualizar o cupom')),
  });

  if (query.isLoading) return <Skeleton className="h-64 rounded-surface" />;
  const cupons = query.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="txt-subtitulo font-semibold text-foreground">Cupons</h2>
              <p className="mt-1 txt-apoio text-muted-foreground">
                O desconto é aplicado na emissão da cobrança, sobre o valor já negociado. Quem
                concede é você: o cliente não digita código em lugar nenhum.
              </p>
            </div>
            <Button size="sm" onClick={() => setCriando(true)}>
              <CirclePlus className="mr-2 h-4 w-4" />
              Novo cupom
            </Button>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="txt-apoio text-muted-foreground">
              <strong>Cortesia total não é cupom.</strong> O desconto percentual é limitado a 90%
              pelo gateway, e um cupom que zerasse o valor produziria uma cobrança de R$ 0,00, que
              ele não emite. Para isentar um cliente por completo, use{' '}
              <strong>preço especial com valor fixo R$ 0,00</strong> — a fatura simplesmente não
              nasce.
            </p>
          </div>
        </CardContent>
      </Card>

      {!cupons.length ? (
        <EmptyState
          icon={TicketPercent}
          title="Nenhum cupom criado"
          description="Crie um cupom e atribua a um cliente para o desconto entrar na próxima cobrança."
          actionLabel="Novo cupom"
          onAction={() => setCriando(true)}
        />
      ) : (
        <div className="space-y-3">
          {cupons.map((c) => (
            <ListCard
              key={c.id}
              icone={TicketPercent}
              titulo={<span className="font-mono">{c.code}</span>}
              subtitulo={c.description ?? undefined}
              selo={
                <Badge variant={c.currentlyValid ? 'success' : 'outline'}>
                  {c.currentlyValid ? 'Vale agora' : c.active ? 'Fora da vigência' : 'Desativado'}
                </Badge>
              }
              acoes={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${c.active ? 'Desativar' : 'Reativar'} o cupom ${c.code}`}
                  onClick={() => alternar.mutate(c)}
                >
                  {c.active ? <Ban /> : <CheckCircle2 />}
                </Button>
              }
              campos={[
                {
                  rotulo: 'Desconto',
                  icone: TicketPercent,
                  enfase: true,
                  valor:
                    c.discountType === 'PERCENTAGE'
                      ? `${c.discountValue}%`
                      : fmtMoeda(c.discountValue),
                },
                {
                  rotulo: 'Usos',
                  icone: CheckCircle2,
                  valor: `${c.usageCount}${c.maxUses ? ` de ${c.maxUses}` : ''}`,
                },
                {
                  rotulo: 'Por cliente',
                  icone: Building2,
                  valor: c.maxUsesPerCustomer
                    ? `${c.maxUsesPerCustomer} cobrança(s)`
                    : 'sem limite',
                },
              ]}
            />
          ))}
        </div>
      )}

      <FormDialog
        open={criando}
        onOpenChange={setCriando}
        title="Novo cupom"
        description="O cupom é criado no gateway de pagamento. Depois, atribua a um cliente."
        submitLabel="Criar cupom"
        saving={criar.isPending}
        onSubmit={() => criar.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="cupom-code">Código</Label>
          <Input
            id="cupom-code"
            className="font-mono uppercase"
            placeholder="BEMVINDO20"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            required
          />
          <p className="txt-nota text-muted-foreground">Letras, números, hífen e sublinhado.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cupom-desc">Descrição</Label>
          <Input
            id="cupom-desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cupom-tipo">Tipo</Label>
            <SimpleSelect
              id="cupom-tipo"
              value={form.discountType}
              onValueChange={(v) =>
                setForm({ ...form, discountType: v as 'PERCENTAGE' | 'FIXED_AMOUNT' })
              }
              options={[
                { value: 'PERCENTAGE', label: 'Percentual (até 90%)' },
                { value: 'FIXED_AMOUNT', label: 'Valor fixo' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cupom-valor">
              {form.discountType === 'PERCENTAGE' ? 'Percentual' : 'Valor'}
            </Label>
            <Input
              id="cupom-valor"
              type="number"
              step="0.01"
              min={0.01}
              max={form.discountType === 'PERCENTAGE' ? 90 : undefined}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cupom-por-cliente">Cobranças por cliente</Label>
          <Input
            id="cupom-por-cliente"
            type="number"
            min={1}
            placeholder="sem limite"
            value={form.maxUsesPerCustomer}
            onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value })}
          />
          <p className="txt-nota text-muted-foreground">
            Cada fatura é uma cobrança — então <strong>3</strong> aqui são três meses de desconto.
          </p>
        </div>
      </FormDialog>
    </div>
  );
}

/**
 * A política de bloqueio por inadimplência.
 *
 * A tela precisa dizer **duas coisas diferentes**, e confundi-las é o erro mais
 * fácil aqui: a política (quantas faturas, quantos dias) e se o bloqueio está
 * mesmo agindo (`PAYMENT_BLOQUEIO_ATIVO`, que só muda por variável de ambiente).
 * Política salva com o interruptor desligado não bloqueia ninguém — e é assim
 * que esta funcionalidade sobe.
 */
function PainelPoliticaAcesso() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['assinatura-politica'],
    queryFn: () => api.get<PoliticaAcesso>('/admin/assinaturas/politica-acesso'),
  });
  const [form, setForm] = useState<Partial<PoliticaAcesso>>({});

  const salvar = useMutation({
    mutationFn: () => api.put<PoliticaAcesso>('/admin/assinaturas/politica-acesso', form),
    onSuccess: (p) => {
      if (p.erroUltimaSync) toast.error(`Salvo aqui, mas o gateway recusou: ${p.erroUltimaSync}`);
      else toast.success('Política salva e enviada ao gateway.');
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['assinatura-politica'] });
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível salvar a política')),
  });

  if (query.isLoading) return <Skeleton className="h-64 rounded-surface" />;
  const p = query.data;
  if (!p) return null;

  const valor = <K extends keyof PoliticaAcesso>(campo: K): PoliticaAcesso[K] =>
    (form[campo] ?? p[campo]) as PoliticaAcesso[K];

  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div>
          <h2 className="txt-subtitulo font-semibold text-foreground">
            Bloqueio por inadimplência
          </h2>
          <p className="mt-1 txt-apoio text-muted-foreground">
            Com a assinatura em atraso, o cliente continua <strong>lendo</strong> tudo, mas não
            registra encomenda nem edita cadastro. Leitura nunca é bloqueada.
          </p>
        </div>

        <div
          className={`rounded-lg p-4 ${p.bloqueioAtivo ? 'bg-destructive/10' : 'bg-muted'}`}
        >
          <p className="txt-corpo font-medium text-foreground">
            {p.bloqueioAtivo ? 'O bloqueio está ATIVO' : 'O bloqueio está desligado'}
          </p>
          <p className="mt-1 txt-apoio text-muted-foreground">
            {p.bloqueioAtivo
              ? 'Clientes em atraso já estão sendo impedidos de escrever.'
              : 'A política abaixo está salva, mas ninguém é bloqueado. Ligar exige ' +
                'PAYMENT_BLOQUEIO_ATIVO=true no servidor — de propósito: é o freio de mão ' +
                'desta funcionalidade, e desligar não precisa de deploy.'}
            {!p.integracaoLigada && ' A cobrança também está desligada neste ambiente.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dias-tolerancia">Dias de tolerância</Label>
            <Input
              id="dias-tolerancia"
              type="number"
              min={0}
              max={90}
              value={valor('diasTolerancia')}
              onChange={(e) => setForm({ ...form, diasTolerancia: Number(e.target.value) })}
            />
            <p className="txt-nota text-muted-foreground">
              Depois do vencimento, antes de travar. Recomendado: 5 — quem esquece o boleto não
              fica sem portaria na segunda de manhã.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-vencidas">Faturas vencidas até bloquear</Label>
            <Input
              id="max-vencidas"
              type="number"
              min={1}
              max={12}
              value={valor('maxFaturasVencidas')}
              onChange={(e) => setForm({ ...form, maxFaturasVencidas: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="msg-bloqueio">Mensagem que o cliente lê</Label>
          <Input
            id="msg-bloqueio"
            maxLength={300}
            value={valor('mensagemBloqueio') ?? ''}
            onChange={(e) => setForm({ ...form, mensagemBloqueio: e.target.value })}
          />
        </div>

        <CheckboxField
          id="bloquear-avulsas"
          checked={valor('bloquearAvulsas')}
          onCheckedChange={(v) => setForm({ ...form, bloquearAvulsas: v === true })}
          label="Considerar as cobranças da assinatura no bloqueio"
          description="Sem isto NADA bloqueia: as nossas faturas são cobranças avulsas, e o padrão do gateway é ignorá-las."
        />

        <div className="rounded-lg bg-muted p-4">
          <p className="txt-apoio text-muted-foreground">
            <strong>Mudança de política não vale na hora.</strong> O gateway guarda a decisão por{' '}
            {p.cacheTtlMinutos} minuto(s), e alterar a regra não limpa esse cache — o efeito
            aparece depois desse tempo.
            {p.sincronizadoEm
              ? ` Última sincronização: ${fmtData(p.sincronizadoEm.slice(0, 10))}.`
              : ' Ainda não foi enviada ao gateway.'}
          </p>
          {p.erroUltimaSync && (
            <p className="mt-2 txt-apoio text-destructive">
              O gateway recusou a última tentativa: {p.erroUltimaSync}
            </p>
          )}
        </div>

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !Object.keys(form).length}>
          <ShieldAlert className="mr-2 h-4 w-4" />
          Salvar política
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * O que a conciliação encontrou e **não conserta sozinha**.
 *
 * Duas listas, com causas diferentes: fatura que passou 24h sem virar cobrança
 * (a emissão já tem fila e retry, então repetir não resolve — falta cadastro ou
 * configuração), e baixa nossa que o gateway ainda não confirmou.
 *
 * Some da tela quando não há nada: um bloco vazio permanente vira ruído que
 * esconde o dia em que houver alguma coisa.
 */
function PendenciasDeCobrancaBloco() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['assinatura-cobranca-pendencias'],
    queryFn: () => api.get<PendenciasDeCobranca>('/admin/assinaturas/cobrancas/pendencias'),
  });

  const conciliar = useMutation({
    mutationFn: () =>
      api.post<ResultadoConciliacao>('/admin/assinaturas/cobrancas/conciliar', {}),
    onSuccess: (r) => {
      if (!r.ligada) toast.error('Cobrança desligada neste ambiente.');
      else if (r.divergentes) toast.success(`${r.divergentes} fatura(s) atualizada(s) pelo gateway.`);
      else toast.success(`${r.conferidas} cobrança(s) conferida(s), tudo em dia.`);
      queryClient.invalidateQueries({ queryKey: ['assinatura-cobranca-pendencias'] });
      queryClient.invalidateQueries({ queryKey: ['assinatura-faturas'] });
      queryClient.invalidateQueries({ queryKey: ['assinatura-resumo'] });
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível conciliar')),
  });

  const dados = query.data;
  const total = (dados?.semCobranca.length ?? 0) + (dados?.dessincronizadas.length ?? 0);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="txt-subtitulo font-semibold text-foreground">Cobranças</h2>
            <p className="mt-1 txt-apoio text-muted-foreground">
              A conciliação roda sozinha de hora em hora e relê cada cobrança viva no gateway.
              O que sobra aqui precisa de gente.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => conciliar.mutate()}
            disabled={conciliar.isPending}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${conciliar.isPending ? 'animate-spin' : ''}`} />
            Conciliar agora
          </Button>
        </div>

        {!total ? (
          <p className="txt-apoio text-muted-foreground">
            Nenhuma cobrança pendente de conferência.
          </p>
        ) : (
          <div className="space-y-4">
            {!!dados?.semCobranca.length && (
              <ListaDeFaturasPendentes
                titulo="Sem cobrança há mais de 24h"
                apoio="A fatura existe e nunca virou cobrança. Repetir não resolve — confira o cadastro do cliente."
                faturas={dados.semCobranca}
              />
            )}
            {!!dados?.dessincronizadas.length && (
              <ListaDeFaturasPendentes
                titulo="Baixa não confirmada no gateway"
                apoio="O pagamento foi registrado aqui e o gateway ainda não confirmou. A conciliação resolve na próxima rodada."
                faturas={dados.dessincronizadas}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Bloco chapado dentro do card — nunca outro `Card` (regra 23). */
function ListaDeFaturasPendentes({
  titulo,
  apoio,
  faturas,
}: {
  titulo: string;
  apoio: string;
  faturas: FaturaEmPendencia[];
}) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="txt-corpo font-medium text-foreground">
        {titulo} <span className="tabular text-muted-foreground">({faturas.length})</span>
      </p>
      <p className="mt-1 txt-apoio text-muted-foreground">{apoio}</p>
      <ul className="mt-3 space-y-2">
        {faturas.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 txt-apoio text-foreground">
              {f.sacadoNome} · {fmtCompetencia(f.competencia)}
              {f.cobrancaErro ? ` — ${f.cobrancaErro}` : ''}
            </span>
            <span className="font-mono txt-apoio tabular text-muted-foreground">
              {fmtMoeda(f.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Quem hoje não pode ser cobrado — a tela que impede o silêncio.
 *
 * Sem ela, um condomínio sem CNPJ simplesmente não receberia cobrança, e o
 * primeiro sinal seria a receita do mês vir menor sem explicação. A lista é
 * lida do **nosso cadastro**, sem chamar o gateway: ela precisa abrir
 * justamente quando a API de pagamento está fora do ar.
 */
function PainelPendenciasClientes() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['assinatura-pendencias'],
    queryFn: () => api.get<PainelPendencias>('/admin/assinaturas/clientes/pendencias'),
  });

  const sincronizar = useMutation({
    mutationFn: (cliente: PendenciaCliente) =>
      api.post<ResultadoSincronizacao>(
        `/admin/assinaturas/clientes/${cliente.tipo}/${cliente.id}/sincronizar`,
        {},
      ),
    onSuccess: (resultado, cliente) => {
      // O endpoint responde 200 mesmo quando não deu certo: a falha é estado do
      // cliente, não erro da request. Quem traduz isso para o usuário é aqui.
      if (resultado.ok) toast.success(`${cliente.nome} sincronizado com o gateway.`);
      else toast.error(resultado.detalhe ?? 'Não foi possível sincronizar este cliente.');
      queryClient.invalidateQueries({ queryKey: ['assinatura-pendencias'] });
    },
    onError: (err) => toast.error(mensagemErro(err, 'Não foi possível sincronizar o cliente')),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-surface" />
        ))}
      </div>
    );
  }

  const painel = query.data;
  if (!painel) return null;

  return (
    <div className="space-y-4">
      {!painel.integracaoLigada && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4 md:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <PlugZap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="txt-subtitulo font-semibold text-foreground">
                Cobrança desligada neste ambiente
              </h2>
              <p className="mt-1 txt-apoio text-muted-foreground">
                Sem <span className="font-mono">PAYMENT_API_BASE_URL</span>, nenhum cliente é
                enviado ao gateway. As faturas continuam sendo geradas e calculadas normalmente —
                só a cobrança não sai. A lista abaixo já mostra o que precisaria de conserto no
                cadastro antes de ligar.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={Building2} title="Clientes" value={painel.resumo.clientes} />
        <StatCard
          icon={CheckCircle2}
          title="Prontos"
          value={painel.resumo.sincronizados}
          variant="success"
        />
        <StatCard
          icon={AlertTriangle}
          title="Pendentes"
          value={painel.resumo.pendentes}
          variant={painel.resumo.pendentes ? 'warning' : 'default'}
        />
      </div>

      <PendenciasDeCobrancaBloco />
      <PainelPoliticaAcesso />

      {!painel.pendencias.length ? (
        <EmptyState
          icon={CheckCircle2}
          title="Todo cliente pode ser cobrado"
          description="Todos têm documento válido e cliente criado no gateway de pagamento."
        />
      ) : (
        <div className="space-y-3">
          {painel.pendencias.map((p) => {
            const meta = MOTIVO_PENDENCIA[p.motivo];
            const emAndamento = sincronizar.isPending && sincronizar.variables?.id === p.id;

            return (
              <ListCard
                key={`${p.tipo}:${p.id}`}
                icone={p.tipo === 'condominio' ? Building2 : Briefcase}
                titulo={p.nome}
                subtitulo={p.tipo === 'condominio' ? 'Condomínio direto' : 'Administradora'}
                selo={
                  <Badge variant={meta.sincronizavel ? 'secondary' : 'outline'}>{meta.rotulo}</Badge>
                }
                acoes={
                  meta.sincronizavel && painel.integracaoLigada ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Sincronizar ${p.nome} com o gateway`}
                      disabled={emAndamento}
                      onClick={() => sincronizar.mutate(p)}
                    >
                      <RefreshCw className={emAndamento ? 'animate-spin' : undefined} />
                    </Button>
                  ) : undefined
                }
                campos={[
                  {
                    rotulo: 'Documento',
                    icone: IdCard,
                    valor: p.documento ? formatarDocumento(p.documento) : '—',
                  },
                  {
                    rotulo: 'O que fazer',
                    icone: AlertTriangle,
                    largura: 'inteira',
                    valor: p.detalhe,
                  },
                ]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const TIPOS_CLIENTE: OpcaoSegmento<TipoClienteAssinatura>[] = [
  { valor: 'condominio', label: 'Condomínio' },
  { valor: 'administradora', label: 'Administradora' },
];

const EXPLICACAO_TIPO: Record<TipoClienteAssinatura, string> = {
  condominio:
    'Vale para o condomínio que paga sozinho — o que não está em nenhuma carteira.',
  administradora:
    'Vale para a administradora, sobre a soma da carteira inteira. Os condomínios dela não são cobrados separadamente.',
};

/**
 * As duas tabelas de preço da plataforma.
 *
 * São tabelas independentes, e não uma com exceção: a administradora traz vários
 * condomínios de uma vez e paga preço de atacado, enquanto o condomínio direto
 * anda pelas faixas de volume. O `SegmentedFilter` troca entre elas — e o tipo
 * escolhido vai para o endpoint, que **exige** o parâmetro justamente para
 * ninguém editar uma tabela achando que é a outra.
 */
function PainelPrecos() {
  const [tipo, setTipo] = useState<TipoClienteAssinatura>('condominio');
  const [editando, setEditando] = useState(false);
  const query = useQuery({
    queryKey: ['assinatura-faixas', tipo],
    queryFn: () => api.get<AssinaturaFaixa[]>(`/admin/assinaturas/faixas?tipo=${tipo}`),
  });

  return (
    <div className="space-y-4">
      <SegmentedFilter
        aria="Tabela de preços de qual tipo de cliente"
        valor={tipo}
        aoMudar={setTipo}
        opcoes={TIPOS_CLIENTE}
      />

      {query.isLoading ? (
        <Skeleton className="h-48 rounded-surface" />
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4 md:p-5">
            <div>
              <h2 className="txt-subtitulo font-semibold text-foreground">Preço por apartamento</h2>
              <p className="mt-1 txt-apoio text-muted-foreground">
                {EXPLICACAO_TIPO[tipo]} A faixa é escolhida pela quantidade e o preço dela vale
                para <strong>todos</strong> os apartamentos — não é escalonado por trecho.
              </p>
            </div>

            {query.data?.length === 0 ? (
              <EmptyState
                icon={Table2}
                title="Sem tabela para este tipo"
                description="Cadastre ao menos uma faixa; a última precisa ficar sem teto."
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {query.data?.map((faixa) => (
                  <li key={faixa.ordem} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="txt-corpo text-foreground">
                      {faixa.ateQuantidade === null
                        ? 'Acima disso'
                        : `Até ${faixa.ateQuantidade} apartamentos`}
                    </span>
                    <span className="font-mono txt-corpo tabular text-foreground">
                      {fmtMoeda(faixa.precoApartamento)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="txt-apoio text-muted-foreground">
              Mudar a tabela vale a partir da próxima geração. Fatura já emitida guarda o preço que
              foi cobrado e não é reescrita.
            </p>

            <Button variant="outline" onClick={() => setEditando(true)}>
              <Table2 className="mr-2 h-4 w-4" />
              Editar tabela de preços
            </Button>
          </CardContent>
        </Card>
      )}

      <EditarFaixasDialog
        open={editando}
        onOpenChange={setEditando}
        tipo={tipo}
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
  tipo,
  faixasAtuais,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TipoClienteAssinatura;
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
      // O tipo vai na URL, não no corpo: é o mesmo parâmetro do `GET`, e é ele
      // que impede a tabela de um tipo de substituir a do outro.
      api.put<AssinaturaFaixa[]>(`/admin/assinaturas/faixas?tipo=${tipo}`, {
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
                <Label htmlFor={`ate-${i}`}>
                  {ehUltima ? 'Acima da faixa anterior' : 'Até quantos apartamentos'}
                </Label>
                <Input
                  id={`ate-${i}`}
                  type="number"
                  min={1}
                  value={linha.ateQuantidade}
                  disabled={ehUltima}
                  placeholder={ehUltima ? 'Sem teto' : ''}
                  onChange={(e) => alterar(i, 'ateQuantidade', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`preco-${i}`}>
                  Preço por apartamento (R$)
                </Label>
                <Input
                  id={`preco-${i}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={linha.precoApartamento}
                  onChange={(e) => alterar(i, 'precoApartamento', e.target.value)} />
              </div>
            </div>
          );
        })}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
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
              className="flex-1"
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
        <Label htmlFor="gerar-competencia">
          Competência
        </Label>
        <Input
          id="gerar-competencia"
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)} />
        <p className="txt-apoio text-muted-foreground">
          A assinatura é pós-paga: fatura-se o mês que fechou.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gerar-vencimento">
          Dia do vencimento
        </Label>
        <Input
          id="gerar-vencimento"
          type="number"
          min={1}
          max={31}
          value={diaVencimento}
          onChange={(e) => setDiaVencimento(e.target.value)} />
        <p className="txt-apoio text-muted-foreground">
          No mês seguinte à competência. Dia 31 em mês de 30 cai no último dia.
        </p>
      </div>
    </FormDialog>
  );
}
