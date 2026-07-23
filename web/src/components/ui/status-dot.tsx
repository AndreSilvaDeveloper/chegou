import { cn } from "@/lib/utils";

type Tone = "waiting" | "notified" | "done" | "neutral" | "danger";

const TONE: Record<Tone, string> = {
  waiting: "bg-amber-500",
  notified: "bg-sky-500",
  done: "bg-emerald-500",
  neutral: "bg-zinc-400 dark:bg-zinc-500",
  danger: "bg-red-500",
};

interface StatusDotProps {
  tone: Tone;
  label: string;
  /** Pulse the dot to signal something still in motion (waiting/notified) */
  pulse?: boolean;
  className?: string;
}

/**
 * Control-desk status line: a colored dot + label. Used alongside/instead of
 * pill badges to read like an instrument readout.
 */
export function StatusDot({ tone, label, pulse, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium text-foreground/80", className)}>
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-dot", TONE[tone])} />
        )}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", TONE[tone])} />
      </span>
      {label}
    </span>
  );
}
