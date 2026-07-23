import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    label: string;
  };
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}

const variantStyles = {
  default: { icon: "border-border bg-muted text-muted-foreground", rail: "bg-border", trend: "text-muted-foreground" },
  primary: { icon: "border-primary/30 bg-primary/10 text-primary", rail: "bg-primary", trend: "text-primary" },
  success: { icon: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", rail: "bg-emerald-500", trend: "text-emerald-600 dark:text-emerald-400" },
  warning: { icon: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400", rail: "bg-amber-500", trend: "text-amber-600 dark:text-amber-400" },
  danger: { icon: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400", rail: "bg-red-500", trend: "text-red-600 dark:text-red-400" },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  variant = "default",
  className,
}: StatCardProps) {
  const styles = variantStyles[variant];
  const Trend = trend && trend.value < 0 ? TrendingDown : TrendingUp;

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* signal rail — the tile's variant, read at a glance */}
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", styles.rail)} aria-hidden />
      <div className="flex items-start justify-between gap-3 p-5 pl-6 md:p-6 md:pl-7">
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate">{title}</p>
          <p className="mt-3 font-mono text-3xl font-bold tabular leading-none tracking-tight text-foreground md:text-4xl">
            {value}
          </p>
          {description && (
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
          )}
          {trend && (
            <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", styles.trend)}>
              <Trend className="h-3.5 w-3.5" />
              <span className="tabular">{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </p>
          )}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border md:h-12 md:w-12", styles.icon)}>
          <Icon className="h-5 w-5 md:h-6 md:w-6" />
        </div>
      </div>
    </Card>
  );
}
