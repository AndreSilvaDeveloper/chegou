import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { DashboardData } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Clock, PackageCheck, Timer, Plus, LayoutDashboard } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from '@/components/ui/chart';
import {
  EIXO_X, EIXO_Y, GRADE, PONTA_BARRA, SERIE_ENTRADA, SERIE_SAIDA,
} from '@/lib/graficos';

/**
 * Duas séries, e não três.
 *
 * O gráfico empilhava recebidas + retiradas + pendentes, e essa soma não
 * existe: `pendentes` é um SUBCONJUNTO de `recebidas` (o que chegou naquele dia
 * e ainda está na portaria), e `retiradas` conta por outra data — a da retirada,
 * não a da chegada. Num dia com 10 recebidas (3 ainda paradas) e 8 retiradas, a
 * pilha desenhava 21, um número que não quer dizer nada.
 *
 * Ficaram os dois fluxos comparáveis — o que ENTROU e o que SAIU no período. O
 * que ainda está parado é estoque, não fluxo: mora no indicador "Aguardando
 * retirada" e na linha de resumo embaixo do gráfico.
 */
const chartConfig: ChartConfig = {
  recebidas: { label: 'Recebidas', color: SERIE_ENTRADA },
  retiradas: { label: 'Retiradas', color: SERIE_SAIDA },
};

function fmtTempo(horas: number | null): string {
  if (horas == null) return '—';
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

type View = 'semana' | 'meses';

const VISOES: OpcaoSegmento<View>[] = [
  { valor: 'semana', label: 'Semana' },
  { valor: 'meses', label: 'Mensal' },
];

export function Dashboard() {
  const [view, setView] = useState<View>('semana');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/encomendas/dashboard'),
    refetchInterval: 60000,
  });

  const serie = view === 'semana' ? data?.semana ?? [] : data?.meses ?? [];
  const totalRecebidas = serie.reduce((soma, p) => soma + p.recebidas, 0);
  const totalRetiradas = serie.reduce((soma, p) => soma + p.retiradas, 0);
  const aindaNaPortaria = serie.reduce((soma, p) => soma + p.pendentes, 0);
  const semMovimento = totalRecebidas === 0 && totalRetiradas === 0;

  return (
    <PageShell
      icon={LayoutDashboard}
      eyebrow="Portaria"
      title="Dashboard"
      description="Visão geral das entregas do condomínio"
      acoes={
        <Link to="/encomendas/nova" className="flex-1 sm:flex-none">
          <Button className="w-full rounded-full" type="button">
            <Plus className="mr-2 h-4 w-4" /> Registrar encomenda
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-surface" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Recebidas no mês"
              value={data?.cards.totalMes ?? 0}
              icon={Package}
              variant="info"
              trend={data?.cards.variacao != null ? { value: data.cards.variacao, label: 'vs. mês passado' } : undefined}
            />
            <StatCard
              title="Aguardando retirada"
              value={data?.cards.aguardando ?? 0}
              icon={Clock}
              variant="warning"
              description="Paradas na portaria agora"
            />
            <StatCard
              title="Retiradas hoje"
              value={data?.cards.retiradosHoje ?? 0}
              icon={PackageCheck}
              variant="success"
            />
            <StatCard
              title="Tempo médio"
              value={fmtTempo(data?.cards.tempoMedioHoras ?? null)}
              icon={Timer}
              description="Da chegada até a retirada"
            />
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <CardTitle>Entradas e saídas</CardTitle>
              <CardDescription>
                {view === 'semana' ? 'Semana atual, de segunda a domingo.' : 'Últimos 4 meses.'}{' '}
                Cada encomenda conta na chegada e, quando é buscada, no dia da retirada — por
                isso as duas barras não fecham no mesmo total.
              </CardDescription>
            </div>
            <SegmentedFilter
              aria="Período do gráfico"
              valor={view}
              aoMudar={setView}
              opcoes={VISOES}
              className="w-auto self-start"
            />
          </CardHeader>

          <CardContent className="space-y-4 pt-0 md:pt-0">
            {isLoading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : semMovimento ? (
              <EmptyState
                icon={Package}
                title="Nenhuma movimentação no período"
                description="Assim que a portaria registrar uma encomenda, o volume aparece aqui."
              />
            ) : (
              <>
                <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
                  <BarChart data={serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid {...GRADE} />
                    <XAxis dataKey="label" {...EIXO_X} />
                    <YAxis {...EIXO_Y} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="recebidas" fill="var(--color-recebidas)" radius={PONTA_BARRA} />
                    <Bar dataKey="retiradas" fill="var(--color-retiradas)" radius={PONTA_BARRA} />
                  </BarChart>
                </ChartContainer>

                {/* O estoque em uma frase: o gráfico mostra fluxo, e "ainda
                    parado" é outra coisa — misturar os dois era o erro antigo. */}
                <p className="rounded-lg bg-muted px-3 py-2 txt-apoio text-muted-foreground">
                  No período: <strong className="font-mono text-foreground">{totalRecebidas}</strong>{' '}
                  recebida(s) e <strong className="font-mono text-foreground">{totalRetiradas}</strong>{' '}
                  retirada(s).{' '}
                  {aindaNaPortaria > 0 ? (
                    <>
                      Do que chegou, <strong className="font-mono text-foreground">{aindaNaPortaria}</strong>{' '}
                      ainda está na portaria.
                    </>
                  ) : (
                    'Nada do que chegou no período ficou parado.'
                  )}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
