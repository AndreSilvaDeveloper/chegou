import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { RelatorioEncomendas, RelatorioVagas, RelatorioWhatsapp } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  AlertTriangle,
  Boxes,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  Hourglass,
  MessageSquare,
  Package,
  PackageCheck,
  Percent,
  PhoneOff,
  RefreshCw,
  Send,
  Timer,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleEnabled } from '@/hooks/use-tenant-config';

/**
 * Relatórios operacionais do condomínio: portaria (/relatorios/encomendas),
 * saúde dos disparos (/relatorios/whatsapp) e garagem (/relatorios/vagas).
 *
 * O período é resolvido no backend (fuso do condomínio); aqui só calculamos os
 * atalhos para preencher `desde`/`ate`.
 */

const TZ = 'America/Sao_Paulo';

function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDias(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function fmtData(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const fmtInt = (n: number) => n.toLocaleString('pt-BR');

const fmtMoeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** `YYYY-MM-DD` → `dd/MM/aa`, sem passar por Date (que embaralharia o fuso). */
const fmtDataCurta = (ymd: string) => {
  const [a, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
};

/** Horas → "45m", "3h 20m" ou "2d 4h" (o síndico lê tempo, não decimal). */
function fmtHoras(horas: number | null | undefined): string {
  if (horas == null) return '—';
  const min = Math.round(horas * 60);
  if (min < 60) return `${min}m`;
  if (horas < 48) return `${Math.floor(min / 60)}h ${min % 60}m`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${Math.round(horas - dias * 24)}h`;
}

function fmtMinutos(minutos: number | null | undefined): string {
  if (minutos == null) return '—';
  return fmtHoras(minutos / 60);
}

const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);

type PresetKey = '7d' | '30d' | '90d' | '12m' | 'custom';

const PRESETS: { key: PresetKey; label: string; dias: number }[] = [
  { key: '7d', label: '7 dias', dias: 7 },
  { key: '30d', label: '30 dias', dias: 30 },
  { key: '90d', label: '90 dias', dias: 90 },
  { key: '12m', label: '12 meses', dias: 365 },
];

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  sindico: 'Síndico',
  admin: 'Admin',
  porteiro: 'Porteiro',
};

const TIPO_NOTIFICACAO_LABEL: Record<string, string> = {
  encomenda: 'Encomenda',
  cobranca_vaga: 'Cobrança de vaga',
  cobranca_condominio: 'Cobrança de condomínio',
  aviso: 'Aviso',
  lembrete: 'Lembrete',
};

const TIPO_VAGA_LABEL: Record<string, string> = {
  carro: 'Carro',
  moto: 'Moto',
  grande: 'Vaga grande',
  pcd: 'PCD',
};

const STATUS_ENCOMENDA_META: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary' }> = {
  aguardando: { label: 'Aguardando', variant: 'warning' },
  notificado: { label: 'Notificado', variant: 'info' },
  retirada: { label: 'Retirada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
  devolvida: { label: 'Devolvida', variant: 'secondary' },
};

/** Cor do tempo parado na portaria: quanto mais velha a encomenda, mais grave. */
function corAging(horas: number): string {
  if (horas < 24) return 'text-emerald-600 dark:text-emerald-400';
  if (horas < 72) return 'text-amber-600 dark:text-amber-400';
  if (horas < 168) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

const CORES_AGING = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];
const CORES_FAIXA = ['#10b981', '#22c55e', '#0ea5e9', '#f59e0b', '#ef4444'];

// ---------------------------------------------------------------- componentes

function SecaoCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="pt-0 md:pt-0">{children}</CardContent>
    </Card>
  );
}

interface RankItem {
  label: string;
  value: number;
  hint?: string;
}

/**
 * Ranking com barra proporcional. Preferido a gráfico de barras horizontais
 * porque não corta rótulo longo em tela de 375px.
 */
function RankList({
  items,
  emptyLabel,
  formatValue = fmtInt,
}: {
  items: RankItem[];
  emptyLabel: string;
  formatValue?: (n: number) => string;
}) {
  const max = items.reduce((acc, i) => Math.max(acc, i.value), 0);

  if (!items.length) {
    return <p className="py-6 text-center txt-apoio text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate txt-corpo font-medium text-foreground">{item.label}</span>
            <span className="shrink-0 font-mono txt-corpo font-semibold tabular-nums text-foreground">
              {formatValue(item.value)}
              {item.hint && <span className="ml-2 txt-apoio font-normal text-muted-foreground">{item.hint}</span>}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              // valor zero não desenha barra; acima disso, mínimo visível de 2%
              style={{ width: item.value && max ? `${Math.max(2, (item.value / max) * 100)}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tabela sangrando até a borda do card. O `Table` do shadcn já rola sozinho,
 * mas a `<table>` é `w-full` e encolheria as colunas em telas estreitas — por
 * isso cada uso passa uma largura mínima e o scroll fica só na tabela.
 */
function TabelaScroll({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 md:-mx-6">{children}</div>;
}

function CardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function GraficosSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[320px] w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-[280px] w-full rounded-2xl" />
        <Skeleton className="h-[280px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

function ErroCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar o relatório"
          description="Verifique sua conexão e tente novamente."
          actionLabel="Tentar novamente"
          onAction={onRetry}
        />
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- página

type TabKey = 'encomendas' | 'whatsapp' | 'vagas';

export function Relatorios() {
  const [tab, setTab] = useState<TabKey>('encomendas');
  const [preset, setPreset] = useState<PresetKey>('30d');
  const [bloco, setBloco] = useState('');

  // A aba de garagem só existe se o condomínio contratou o módulo. Se ela for
  // desligada com a aba aberta, cai de volta para encomendas.
  const vagasAtivo = useModuleEnabled('vagas') === true;
  const tabAtiva: TabKey = tab === 'vagas' && !vagasAtivo ? 'encomendas' : tab;

  const hoje = useMemo(() => hojeLocal(), []);
  const [customDesde, setCustomDesde] = useState(() => addDias(hoje, -29));
  const [customAte, setCustomAte] = useState(hoje);

  const { desde, ate } = useMemo(() => {
    if (preset === 'custom') return { desde: customDesde, ate: customAte };
    const dias = PRESETS.find((p) => p.key === preset)?.dias ?? 30;
    return { desde: addDias(hoje, -(dias - 1)), ate: hoje };
  }, [preset, customDesde, customAte, hoje]);

  const periodoQuery = `?desde=${desde}&ate=${ate}`;

  const encomendasQuery = useQuery({
    queryKey: ['relatorio-encomendas', desde, ate, bloco],
    queryFn: () =>
      api.get<RelatorioEncomendas>(
        `/relatorios/encomendas${periodoQuery}${bloco ? `&bloco=${encodeURIComponent(bloco)}` : ''}`,
      ),
  });

  const whatsappQuery = useQuery({
    queryKey: ['relatorio-whatsapp', desde, ate],
    queryFn: () => api.get<RelatorioWhatsapp>(`/relatorios/whatsapp${periodoQuery}`),
    enabled: tabAtiva === 'whatsapp',
  });

  const vagasQuery = useQuery({
    queryKey: ['relatorio-vagas'],
    queryFn: () => api.get<RelatorioVagas>('/relatorios/vagas'),
    enabled: tabAtiva === 'vagas',
  });

  const carregando =
    tabAtiva === 'encomendas'
      ? encomendasQuery.isLoading
      : tabAtiva === 'whatsapp'
        ? whatsappQuery.isLoading
        : vagasQuery.isLoading;
  const atualizando =
    tabAtiva === 'encomendas'
      ? encomendasQuery.isFetching
      : tabAtiva === 'whatsapp'
        ? whatsappQuery.isFetching
        : vagasQuery.isFetching;

  const recarregar = () => {
    if (tabAtiva === 'encomendas') encomendasQuery.refetch();
    else if (tabAtiva === 'whatsapp') whatsappQuery.refetch();
    else vagasQuery.refetch();
  };

  // Blocos vêm do relatório de encomendas (lista completa, independe do filtro).
  const blocoOptions = useMemo(
    () => [
      { value: '', label: 'Todos os blocos' },
      ...(encomendasQuery.data?.blocos ?? []).map((b) => ({ value: b, label: `Bloco ${b}` })),
    ],
    [encomendasQuery.data?.blocos],
  );

  const mostrarFiltros = tabAtiva !== 'vagas';

  return (
    <PageShell
      icon={Boxes}
      eyebrow="Análise"
      title="Relatórios"
      description="Volume, tempos de atendimento, saúde dos disparos e ocupação da garagem."
      acoes={
        <Button
          variant="outline"
          onClick={recarregar}
          className="flex-1 rounded-full sm:flex-none"
          type="button"
        >
          <RefreshCw className={cn('mr-2 h-4 w-4', atualizando && 'animate-spin')} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-6">
      <Tabs value={tabAtiva} onValueChange={(v) => setTab(v as TabKey)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="encomendas">
            <Package /> Encomendas
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <MessageSquare /> WhatsApp
          </TabsTrigger>
          {vagasAtivo && (
            <TabsTrigger value="vagas">
              <Car /> Vagas
            </TabsTrigger>
          )}
        </TabsList>

        {/* Filtros de período — não se aplicam ao snapshot de vagas */}
        {mostrarFiltros && (
          <Card>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Período</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPreset(p.key)}
                      className={cn(
                        'rounded-lg border px-4 txt-corpo font-medium transition-colors',
                        preset === p.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPreset('custom')}
                    className={cn(
                      'rounded-lg border px-4 txt-corpo font-medium transition-colors',
                      preset === 'custom'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Escolher datas
                  </button>
                </div>
              </div>

              {preset === 'custom' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rel-desde">
                      Data inicial
                    </Label>
                    <Input
                      id="rel-desde"
                      type="date"
                      value={customDesde}
                      max={customAte}
                      onChange={(e) => setCustomDesde(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rel-ate">
                      Data final
                    </Label>
                    <Input
                      id="rel-ate"
                      type="date"
                      value={customAte}
                      min={customDesde}
                      max={hoje}
                      onChange={(e) => setCustomAte(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {tab === 'encomendas' && (
                <div className="space-y-2">
                  <Label htmlFor="rel-bloco">
                    Bloco
                  </Label>
                  <SimpleSelect
                    id="rel-bloco"
                    value={bloco}
                    onValueChange={setBloco}
                    options={blocoOptions}
                    className="sm:max-w-xs"
                  />
                </div>
              )}

              <p className="txt-apoio text-muted-foreground">
                Analisando de <span className="font-medium text-foreground">{fmtData(desde)}</span> até{' '}
                <span className="font-medium text-foreground">{fmtData(ate)}</span>.
              </p>
            </CardContent>
          </Card>
        )}

        <TabsContent value="encomendas" className="mt-0 space-y-6">
          {encomendasQuery.isError ? (
            <ErroCard onRetry={() => encomendasQuery.refetch()} />
          ) : carregando || !encomendasQuery.data ? (
            <div className="space-y-6">
              <CardsSkeleton />
              <GraficosSkeleton />
            </div>
          ) : (
            <AbaEncomendas data={encomendasQuery.data} />
          )}
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0 space-y-6">
          {whatsappQuery.isError ? (
            <ErroCard onRetry={() => whatsappQuery.refetch()} />
          ) : carregando || !whatsappQuery.data ? (
            <div className="space-y-6">
              <CardsSkeleton />
              <GraficosSkeleton />
            </div>
          ) : (
            <AbaWhatsapp data={whatsappQuery.data} />
          )}
        </TabsContent>

        <TabsContent value="vagas" className="mt-0 space-y-6">
          {vagasQuery.isError ? (
            <ErroCard onRetry={() => vagasQuery.refetch()} />
          ) : carregando || !vagasQuery.data ? (
            <div className="space-y-6">
              <CardsSkeleton />
              <GraficosSkeleton />
            </div>
          ) : (
            <AbaVagas data={vagasQuery.data} />
          )}
        </TabsContent>
      </Tabs>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------- aba: encomendas

const configEncomendas: ChartConfig = {
  recebidas: { label: 'Recebidas', color: '#0ea5e9' },
  retiradas: { label: 'Retiradas', color: '#10b981' },
  total: { label: 'Encomendas', color: 'hsl(var(--primary))' },
};

function AbaEncomendas({ data }: { data: RelatorioEncomendas }) {
  const { resumo, periodo } = data;
  const labelPeriodoAnterior = `vs. ${periodo.dias} dias anteriores`;
  const picoHora = data.porHora.reduce((acc, h) => (h.recebidas > acc.recebidas ? h : acc), data.porHora[0]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Recebidas no período"
          value={fmtInt(resumo.recebidas)}
          icon={Package}
          variant="primary"
          trend={
            resumo.variacao.recebidas != null
              ? { value: resumo.variacao.recebidas, label: labelPeriodoAnterior }
              : undefined
          }
          description={`${fmtInt(resumo.comFoto)} com foto`}
        />
        <StatCard
          title="Retiradas"
          value={fmtInt(resumo.retiradas)}
          icon={PackageCheck}
          variant="success"
          description={`${resumo.taxaRetirada}% do que entrou`}
          trend={
            resumo.variacao.retiradas != null
              ? { value: resumo.variacao.retiradas, label: labelPeriodoAnterior }
              : undefined
          }
        />
        <StatCard
          title="Na portaria agora"
          value={fmtInt(resumo.estoqueAtual)}
          icon={Boxes}
          variant="warning"
          description="Aguardando ou notificadas"
        />
        <StatCard
          title="Tempo de retirada"
          value={fmtHoras(resumo.tempoMedioHoras)}
          icon={Timer}
          description={
            resumo.tempoMedioHoras == null
              ? 'Nenhuma retirada no período'
              : `Mediana ${fmtHoras(resumo.tempoMedianoHoras)} · P90 ${fmtHoras(resumo.tempoP90Horas)}`
          }
          trend={
            resumo.variacao.tempoMedio != null
              ? { value: resumo.variacao.tempoMedio, label: labelPeriodoAnterior }
              : undefined
          }
        />
      </div>

      {/* Volume ao longo do período */}
      <SecaoCard
        title="Volume de encomendas"
        description={`Recebidas e retiradas por ${periodo.granularidade}${periodo.bloco ? ` — bloco ${periodo.bloco}` : ''}.`}
      >
        <ChartContainer config={configEncomendas} className="aspect-auto h-[300px] w-full">
          <AreaChart data={data.serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              {(['recebidas', 'retiradas'] as const).map((k) => (
                <linearGradient key={k} id={`rel-fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.7} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="recebidas"
              type="natural"
              stroke="var(--color-recebidas)"
              fill="url(#rel-fill-recebidas)"
              strokeWidth={2}
            />
            <Area
              dataKey="retiradas"
              type="natural"
              stroke="var(--color-retiradas)"
              fill="url(#rel-fill-retiradas)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </SecaoCard>

      {/* Fluxo de atendimento — a velocidade da notificação é o coração do produto */}
      <SecaoCard
        title="Fluxo de atendimento"
        description="Da chegada na portaria até a retirada pelo morador."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
              <Send className="h-4 w-4 shrink-0" /> Moradores avisados
            </div>
            <p className="mt-2 font-mono txt-numero font-bold tabular-nums text-foreground">
              {resumo.taxaNotificacao}%
            </p>
            <p className="mt-1 txt-apoio text-muted-foreground">
              {fmtInt(resumo.notificadas)} de {fmtInt(resumo.recebidas)} encomendas
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
              <Hourglass className="h-4 w-4 shrink-0" /> Tempo até avisar
            </div>
            <p className="mt-2 font-mono txt-numero font-bold tabular-nums text-foreground">
              {fmtMinutos(resumo.minutosAteNotificar)}
            </p>
            <p className="mt-1 txt-apoio text-muted-foreground">Do registro ao envio no WhatsApp</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" /> Canceladas e devolvidas
            </div>
            <p className="mt-2 font-mono txt-numero font-bold tabular-nums text-foreground">
              {fmtInt(resumo.canceladas + resumo.devolvidas)}
            </p>
            <p className="mt-1 txt-apoio text-muted-foreground">
              {fmtInt(resumo.canceladas)} canceladas · {fmtInt(resumo.devolvidas)} devolvidas
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <p className="eyebrow mb-3">Situação das encomendas do período</p>
          <RankList
            items={resumo.porStatus.map((s) => ({ label: s.label, value: s.total }))}
            emptyLabel="Nenhuma encomenda no período."
          />
        </div>
      </SecaoCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SecaoCard title="Tempo até a retirada" description="Quanto o morador demora para buscar a encomenda.">
          <ChartContainer config={configEncomendas} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.tempoRetirada} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {data.tempoRetirada.map((f, i) => (
                  <Cell key={f.key} fill={CORES_FAIXA[i % CORES_FAIXA.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </SecaoCard>

        <SecaoCard
          title="Idade do estoque atual"
          description="Há quanto tempo cada encomenda pendente está na portaria (agora)."
        >
          <ChartContainer config={configEncomendas} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.aging} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {data.aging.map((f, i) => (
                  <Cell key={f.key} fill={CORES_AGING[i % CORES_AGING.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </SecaoCard>

        <SecaoCard
          title="Horários de pico"
          description={
            picoHora && picoHora.recebidas > 0
              ? `Maior movimento às ${picoHora.label} — útil para montar a escala.`
              : 'Recebimentos por hora do dia.'
          }
        >
          <ChartContainer config={configEncomendas} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.porHora} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} interval={2} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="recebidas" fill="var(--color-recebidas)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </SecaoCard>

        <SecaoCard title="Movimento por dia da semana" description="Volume recebido de segunda a domingo.">
          <ChartContainer config={configEncomendas} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.porDiaSemana} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="recebidas" fill="var(--color-recebidas)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </SecaoCard>
      </div>

      {/* Fila que precisa de cobrança */}
      <SecaoCard
        title="Pendentes mais antigas"
        description="As encomendas paradas há mais tempo na portaria — comece a cobrança por aqui."
      >
        {!data.pendentesAntigas.length ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nenhuma encomenda pendente"
            description="A portaria está com o estoque zerado. Bom trabalho!"
          />
        ) : (
          <TabelaScroll>
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Recebida em</TableHead>
                  <TableHead className="text-right">Parada há</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendentesAntigas.map((e) => {
                  const meta = STATUS_ENCOMENDA_META[e.status] ?? STATUS_ENCOMENDA_META.aguardando;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono font-medium">{e.identificador}</TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{e.destinatario || 'Não informado'}</div>
                          {(e.transportadora || e.descricao) && (
                            <div className="truncate txt-apoio text-muted-foreground">
                              {e.transportadora || e.descricao}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap txt-apoio text-muted-foreground">
                        {new Date(e.criadaEm).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </TableCell>
                      <TableCell className={cn('whitespace-nowrap text-right font-mono font-semibold', corAging(e.horas))}>
                        {fmtHoras(e.horas)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/encomendas/${e.id}`}>
                          <Button variant="ghost" size="sm" >
                            Ver detalhes
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabelaScroll>
        )}
      </SecaoCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SecaoCard title="Apartamentos que mais recebem" description="Top 10 unidades no período.">
          {!data.topApartamentos.length ? (
            <p className="py-6 text-center txt-apoio text-muted-foreground">Nenhuma encomenda no período.</p>
          ) : (
            <TabelaScroll>
              <Table className="min-w-[460px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Recebidas</TableHead>
                    <TableHead className="text-right">Pendentes</TableHead>
                    <TableHead className="text-right">Tempo médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topApartamentos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono font-medium">{a.identificador}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmtInt(a.total)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {a.pendentes > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">{fmtInt(a.pendentes)}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-muted-foreground">
                        {fmtHoras(a.tempoMedioHoras)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabelaScroll>
          )}
        </SecaoCard>

        <SecaoCard title="Transportadoras" description="Quem mais entrega no condomínio.">
          <RankList
            items={data.transportadoras.map((t) => ({
              label: t.nome,
              value: t.total,
              hint: t.tempoMedioHoras != null ? fmtHoras(t.tempoMedioHoras) : undefined,
            }))}
            emptyLabel="Nenhuma transportadora registrada no período."
          />
        </SecaoCard>

        <SecaoCard title="Volume por bloco" description="Distribuição das entregas entre os blocos.">
          <RankList
            items={data.porBloco.map((b) => ({
              label: b.bloco,
              value: b.total,
              hint: `${b.apartamentos} un.`,
            }))}
            emptyLabel="Nenhuma entrega registrada no período."
          />
        </SecaoCard>

        <SecaoCard title="Tipo de volume" description="Formato das encomendas recebidas.">
          <RankList
            items={data.porTipo.map((t) => ({ label: t.label, value: t.total }))}
            emptyLabel="Nenhuma encomenda no período."
          />
        </SecaoCard>
      </div>

      <SecaoCard
        title="Produtividade da portaria"
        description="Encomendas registradas e entregues por cada operador no período."
      >
        {!data.operadores.length ? (
          <EmptyState
            icon={Users}
            title="Nenhuma movimentação registrada"
            description="Assim que a equipe registrar ou entregar encomendas, os números aparecem aqui."
          />
        ) : (
          <TabelaScroll>
            <Table className="min-w-[460px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="text-right">Registradas</TableHead>
                  <TableHead className="text-right">Entregues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operadores.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.nome}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[o.role] ?? o.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtInt(o.recebidas)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtInt(o.retiradas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabelaScroll>
        )}
      </SecaoCard>
    </div>
  );
}

// ------------------------------------------------------------ aba: whatsapp

const configWhatsapp: ChartConfig = {
  enviadas: { label: 'Entregues', color: '#10b981' },
  falhas: { label: 'Falhas', color: '#ef4444' },
  naFila: { label: 'Na fila', color: '#f59e0b' },
};

function AbaWhatsapp({ data }: { data: RelatorioWhatsapp }) {
  const { resumo, alcance } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Mensagens no período"
          value={fmtInt(resumo.total)}
          icon={MessageSquare}
          variant="primary"
          description={`${fmtInt(resumo.naFila)} na fila · ${fmtInt(resumo.agendadas)} agendadas`}
        />
        <StatCard
          title="Taxa de entrega"
          value={fmtPct(resumo.taxaEntrega)}
          icon={CheckCircle2}
          variant="success"
          description={`${fmtInt(resumo.enviadas)} entregues`}
        />
        <StatCard
          title="Falhas"
          value={fmtInt(resumo.falhas)}
          icon={XCircle}
          variant={resumo.falhas > 0 ? 'danger' : 'default'}
          description={
            resumo.tentativasMedia != null
              ? `${resumo.tentativasMedia.toFixed(1)} tentativas por envio`
              : 'Nenhuma falha registrada'
          }
        />
        <StatCard
          title="Espera na fila"
          value={fmtMinutos(resumo.minutosNaFila)}
          icon={Hourglass}
          variant="warning"
          description="Da criação até o envio"
        />
      </div>

      <SecaoCard
        title="Disparos ao longo do período"
        description={`Entregues, falhas e pendências por ${data.periodo.granularidade}.`}
      >
        <ChartContainer config={configWhatsapp} className="aspect-auto h-[300px] w-full">
          <BarChart data={data.serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="enviadas" stackId="a" fill="var(--color-enviadas)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="falhas" stackId="a" fill="var(--color-falhas)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="naFila" stackId="a" fill="var(--color-naFila)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </SecaoCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SecaoCard title="Alcance do cadastro" description="Quantos moradores conseguem receber mensagens hoje.">
          <div className="space-y-5">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="txt-corpo font-medium text-foreground">Moradores alcançáveis</span>
                <span className="font-mono txt-numero-sm font-bold tabular-nums text-foreground">
                  {fmtInt(alcance.alcancaveis)}
                  <span className="ml-1 txt-apoio font-normal text-muted-foreground">
                    / {fmtInt(alcance.moradores)}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${alcance.percentual ?? 0}%` }}
                />
              </div>
              <p className="mt-2 txt-apoio text-muted-foreground">
                {fmtPct(alcance.percentual)} do cadastro ativo recebe notificações.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
                  <PhoneOff className="h-4 w-4 shrink-0" /> Sem telefone
                </div>
                <p className="mt-2 font-mono txt-numero-sm font-bold tabular-nums text-foreground">
                  {fmtInt(alcance.semTelefone)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
                  <XCircle className="h-4 w-4 shrink-0" /> Optaram por não receber
                </div>
                <p className="mt-2 font-mono txt-numero-sm font-bold tabular-nums text-foreground">
                  {fmtInt(alcance.optOut)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <div className="flex items-center gap-2 txt-apoio text-muted-foreground">
                  <Building2 className="h-4 w-4 shrink-0" /> Unidades sem titular
                </div>
                <p className="mt-2 font-mono txt-numero-sm font-bold tabular-nums text-foreground">
                  {fmtInt(alcance.apartamentosSemPrincipal)}
                </p>
              </div>
            </div>
          </div>
        </SecaoCard>

        <SecaoCard title="Envios por hora" description="Concentração dos disparos ao longo do dia.">
          <ChartContainer config={configWhatsapp} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.porHora} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={10} interval={2} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="enviadas" fill="var(--color-enviadas)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </SecaoCard>

        <SecaoCard title="Por tipo de mensagem" description="Volume e falhas de cada motivo de disparo.">
          {!data.porTipo.length ? (
            <p className="py-6 text-center txt-apoio text-muted-foreground">Nenhum disparo no período.</p>
          ) : (
            <TabelaScroll>
              <Table className="min-w-[460px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Entregues</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.porTipo.map((t) => (
                    <TableRow key={t.tipo}>
                      <TableCell className="font-medium">{TIPO_NOTIFICACAO_LABEL[t.tipo] ?? t.tipo}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmtInt(t.total)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {fmtInt(t.enviadas)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {t.falhas > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{fmtInt(t.falhas)}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabelaScroll>
          )}
        </SecaoCard>

        <SecaoCard title="Principais erros" description="Motivos mais frequentes de falha no envio.">
          {!data.erros.length ? (
            <EmptyState
              icon={Send}
              title="Nenhuma falha no período"
              description="Todos os disparos saíram sem erro."
            />
          ) : (
            <ul className="space-y-3">
              {data.erros.map((e) => (
                <li
                  key={e.erro}
                  className="flex items-start justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span className="min-w-0 break-words txt-corpo text-foreground">{e.erro}</span>
                  </div>
                  <span className="shrink-0 font-mono txt-corpo font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {fmtInt(e.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SecaoCard>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- aba: vagas

const configVagas: ChartConfig = {
  ocupadas: { label: 'Ocupadas', color: '#0ea5e9' },
  livres: { label: 'Livres', color: '#10b981' },
  novas: { label: 'Novos contratos', color: 'hsl(var(--primary))' },
};

const STATUS_LOCACAO_META: Record<string, { label: string; variant: 'success' | 'destructive' | 'secondary' }> = {
  ativa: { label: 'Ativa', variant: 'success' },
  inadimplente: { label: 'Inadimplente', variant: 'destructive' },
  encerrada: { label: 'Encerrada', variant: 'secondary' },
};

function AbaVagas({ data }: { data: RelatorioVagas }) {
  const { resumo } = data;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-2 py-4 txt-apoio text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          Este painel mostra a situação atual da garagem — não depende do período selecionado.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Taxa de ocupação"
          value={`${resumo.taxaOcupacao}%`}
          icon={Percent}
          variant="primary"
          description={`${fmtInt(resumo.ocupadas)} de ${fmtInt(resumo.totalVagas)} vagas`}
        />
        <StatCard
          title="Vagas livres"
          value={fmtInt(resumo.livres)}
          icon={Car}
          variant="success"
          description={`${fmtInt(resumo.vinculadas)} vinculadas a unidades`}
        />
        <StatCard
          title="Receita mensal"
          value={fmtMoeda(resumo.receitaMensal)}
          icon={Wallet}
          description={`${fmtInt(resumo.locacoesAtivas)} locações ativas`}
        />
        <StatCard
          title="Inadimplência"
          value={fmtInt(resumo.inadimplentes)}
          icon={AlertTriangle}
          variant={resumo.inadimplentes > 0 ? 'danger' : 'default'}
          description={`${fmtMoeda(resumo.receitaEmRisco)} em risco`}
        />
      </div>

      {/* Histórico financeiro: soma TODAS as competências já geradas, inclusive
          as de contratos encerrados — dívida não some quando o contrato acaba. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Recebido no histórico"
          value={fmtMoeda(data.financeiro.valorRecebido)}
          icon={Wallet}
          variant="success"
          description={`${fmtInt(data.financeiro.cobrancas)} cobrança(s) geradas`}
        />
        <StatCard
          title="Em aberto"
          value={fmtMoeda(data.financeiro.valorEmAberto)}
          icon={Clock}
          variant="warning"
          description="Inclui contratos já encerrados"
        />
        <StatCard
          title="Vencido"
          value={fmtMoeda(data.financeiro.valorVencido)}
          icon={AlertTriangle}
          variant={data.financeiro.valorVencido > 0 ? 'danger' : 'default'}
          description={`${fmtInt(data.financeiro.cobrancasVencidas)} cobrança(s) vencidas`}
        />
      </div>

      <SecaoCard
        title="Histórico por vaga"
        description="O que cada vaga já rendeu, somando todos os contratos — inclusive os encerrados."
      >
        {!data.historicoPorVaga.length ? (
          <EmptyState
            icon={Car}
            title="Nenhuma vaga já alugada"
            description="Quando houver locação, o histórico financeiro de cada vaga aparece aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full txt-corpo">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Vaga</th>
                  <th className="py-2 pr-4 font-medium">Contratos</th>
                  <th className="py-2 pr-4 font-medium">Desde</th>
                  <th className="py-2 pr-4 text-right font-medium">Recebido</th>
                  <th className="py-2 text-right font-medium">Em aberto</th>
                </tr>
              </thead>
              <tbody>
                {data.historicoPorVaga.map((v) => (
                  <tr key={v.numero} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-mono font-semibold text-foreground">{v.numero}</span>
                      <span className="ml-2 text-muted-foreground">
                        {TIPO_VAGA_LABEL[v.tipo] ?? v.tipo}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-foreground">{v.contratos}</td>
                    <td className="py-2 pr-4 font-mono text-muted-foreground">
                      {v.desde ? fmtDataCurta(v.desde) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {fmtMoeda(v.recebido)}
                    </td>
                    <td className="py-2 text-right font-mono text-amber-600 dark:text-amber-400">
                      {v.emAberto > 0 ? fmtMoeda(v.emAberto) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SecaoCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SecaoCard title="Ocupação por tipo de vaga" description="Quantas vagas de cada tipo estão em uso.">
          {!data.porTipo.length ? (
            <EmptyState
              icon={Car}
              title="Nenhuma vaga cadastrada"
              description="Cadastre as vagas da garagem para acompanhar a ocupação."
            />
          ) : (
            <ChartContainer config={configVagas} className="aspect-auto h-[260px] w-full">
              <BarChart
                data={data.porTipo.map((t) => ({ ...t, label: TIPO_VAGA_LABEL[t.tipo] ?? t.tipo }))}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="ocupadas" stackId="a" fill="var(--color-ocupadas)" />
                <Bar dataKey="livres" stackId="a" fill="var(--color-livres)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </SecaoCard>

        <SecaoCard title="Novos contratos" description="Locações iniciadas nos últimos 6 meses.">
          <ChartContainer config={configVagas} className="aspect-auto h-[260px] w-full">
            <BarChart data={data.serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="novas" fill="var(--color-novas)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </SecaoCard>
      </div>

      <SecaoCard
        title="Contratos em vigor"
        description="Locações ativas e inadimplentes, ordenadas pela urgência de cobrança."
      >
        {!data.contratos.length ? (
          <EmptyState
            icon={Car}
            title="Nenhuma locação em vigor"
            description="As locações avulsas de vagas aparecem aqui com valor e vencimento."
          />
        ) : (
          <TabelaScroll>
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Vaga</TableHead>
                  <TableHead>Locatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Vencimento</TableHead>
                  <TableHead className="text-right">Início</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.contratos.map((c) => {
                  const meta = STATUS_LOCACAO_META[c.status] ?? STATUS_LOCACAO_META.ativa;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-mono font-medium">{c.numero}</div>
                        <div className="txt-apoio text-muted-foreground">{TIPO_VAGA_LABEL[c.tipo] ?? c.tipo}</div>
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{c.morador || 'Não informado'}</div>
                          {c.apartamento && (
                            <div className="font-mono txt-apoio text-muted-foreground">{c.apartamento}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                        {fmtMoeda(c.valor)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-muted-foreground">
                        dia {c.diaVencimento}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right txt-apoio text-muted-foreground">
                        {fmtData(c.dataInicio)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabelaScroll>
        )}
      </SecaoCard>
    </div>
  );
}
