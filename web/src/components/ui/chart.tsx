import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  }
>;

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error('useChart deve ser usado dentro de <ChartContainer>');
  return ctx;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-tooltip-cursor]:stroke-border [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'ChartContainer';

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorEntries = Object.entries(config).filter(([, c]) => c.color);
  if (!colorEntries.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colorEntries
          .map(([key, c]) => `  --color-${key}: ${c.color};`)
          .join('\n')}\n}`,
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipItem {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
  color?: string;
  payload?: { fill?: string };
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  { active?: boolean; payload?: TooltipItem[]; label?: React.ReactNode; className?: string }
>(({ active, payload, label, className }, ref) => {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-[10rem] items-start gap-1.5 rounded-lg border border-border/50 bg-card px-3 py-2 text-xs shadow-panel-lg',
        className,
      )}
    >
      {label && <div className="font-medium text-foreground">{label}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, i) => {
          const key = String(item.dataKey ?? item.name ?? i);
          const cfg = config[key];
          const color = (item.payload?.fill as string) || (item.color as string);
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: `var(--color-${key}, ${color})` }} />
                <span className="text-muted-foreground">{cfg?.label ?? item.name}</span>
              </div>
              <span className="font-mono font-medium tabular-nums text-foreground">{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = 'ChartTooltipContent';

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  { payload?: { value: string; dataKey?: string; color?: string }[]; className?: string }
>(({ payload, className }, ref) => {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div ref={ref} className={cn('flex flex-wrap items-center justify-center gap-4 pt-3', className)}>
      {payload.map((item, i) => {
        const key = String(item.dataKey ?? item.value ?? i);
        const cfg = config[key];
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: `var(--color-${key}, ${item.color})` }} />
            {cfg?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = 'ChartLegendContent';

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  useChart,
};
