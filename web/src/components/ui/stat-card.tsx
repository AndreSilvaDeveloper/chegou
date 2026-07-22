import { type LucideIcon } from "lucide-react";
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
  default: {
    icon: "bg-muted text-muted-foreground",
    trend: "text-muted-foreground",
  },
  primary: {
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    trend: "text-blue-600 dark:text-blue-400",
  },
  success: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    trend: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    trend: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    icon: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    trend: "text-red-600 dark:text-red-400",
  },
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

  return (
    <Card className={cn("p-5 md:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground truncate">
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {value}
          </p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">
              {description}
            </p>
          )}
          {trend && (
            <p className={cn("mt-1 text-xs font-medium", styles.trend)}>
              {trend.value > 0 ? "↑" : trend.value < 0 ? "↓" : "→"}{" "}
              {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg md:h-12 md:w-12",
            styles.icon
          )}
        >
          <Icon className="h-5 w-5 md:h-6 md:w-6" />
        </div>
      </div>
    </Card>
  );
}
