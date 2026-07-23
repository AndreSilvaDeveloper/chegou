import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Small mono label above the title, e.g. "Portaria" or "Central" */
  eyebrow?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, icon: Icon, children, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex items-center gap-3.5">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-panel md:h-12 md:w-12">
            <Icon className="h-5 w-5 md:h-6 md:w-6" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
