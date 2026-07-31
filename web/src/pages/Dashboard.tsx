import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { DashboardData } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Clock, PackageCheck, Timer, Plus, LayoutDashboard } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

// Cores semânticas do sistema: info=sky (recebido/azul), success=emerald (retirado), danger=red (pendente).
const chartConfig: ChartConfig = {
  recebidas: { label: 'Recebidas', color: '#0ea5e9' },
  retiradas: { label: 'Retiradas', color: '#10b981' },
  pendentes: { label: 'Pendentes', color: '#ef4444' },
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

export function Dashboard() {
  const [view, setView] = useState<View>('semana');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/encomendas/dashboard'),
    refetchInterval: 60000,
  });

  const serie = view === 'semana' ? data?.semana ?? [] : data?.meses ?? [];

  return (
    <PageShell
      icon={LayoutDashboard}
      eyebrow="Portaria"
      title="Dashboard"
      description="Visão geral das entregas do condomínio"
      acoes={
        <Link to="/encomendas/nova" className="flex-1 sm:flex-none">
          <Button className="w-full rounded-full" type="button">
            <Plus className="mr-2 h-4 w-4" /> Registrar Encomenda
          </Button>
        </Link>
      }
    >
      <div className="space-y-8">

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Recebido (Mês)"
            value={data?.cards.totalMes ?? 0}
            icon={Package}
            variant="primary"
            trend={data?.cards.variacao != null ? { value: data.cards.variacao, label: 'vs. mês passado' } : undefined}
          />
          <StatCard title="Aguardando Retirada" value={data?.cards.aguardando ?? 0} icon={Clock} variant="warning" />
          <StatCard title="Retiradas Hoje" value={data?.cards.retiradosHoje ?? 0} icon={PackageCheck} variant="success" />
          <StatCard
            title="Tempo Médio"
            value={fmtTempo(data?.cards.tempoMedioHoras ?? null)}
            icon={Timer}
            description="De recebimento até retirada"
          />
        </div>
      )}

      {/* Volume chart */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Volume de entregas</CardTitle>
            <CardDescription>
              {view === 'semana' ? 'Semana atual (segunda a domingo)' : 'Últimos 4 meses'} — recebidas, retiradas e pendentes.
            </CardDescription>
          </div>
          <div className="flex gap-1 self-start rounded-lg bg-muted/40 p-1">
            {(['semana', 'meses'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'min-h-[36px] rounded-md px-4 txt-corpo font-medium transition-colors',
                  view === v ? 'bg-card text-foreground shadow-panel' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'semana' ? 'Semana' : 'Mensal'}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-0 md:pt-0">
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
              <AreaChart data={serie} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  {(['recebidas', 'retiradas', 'pendentes'] as const).map((k) => (
                    <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.1} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} width={32} fontSize={12} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="recebidas"
                  type="natural"
                  stroke="var(--color-recebidas)"
                  fill="url(#fill-recebidas)"
                  fillOpacity={0.4}
                  stackId="a"
                  strokeWidth={2}
                />
                <Area
                  dataKey="retiradas"
                  type="natural"
                  stroke="var(--color-retiradas)"
                  fill="url(#fill-retiradas)"
                  fillOpacity={0.4}
                  stackId="a"
                  strokeWidth={2}
                />
                <Area
                  dataKey="pendentes"
                  type="natural"
                  stroke="var(--color-pendentes)"
                  fill="url(#fill-pendentes)"
                  fillOpacity={0.4}
                  stackId="a"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
