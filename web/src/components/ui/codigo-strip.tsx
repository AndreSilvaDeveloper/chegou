import { cn } from "@/lib/utils";

interface CodigoStripProps {
  /** The pickup code, e.g. "4821". Non-digits are shown as-is. */
  codigo: string;
  /** sm = inline in list cards, lg = hero on the detail screen */
  size?: "sm" | "lg";
  /** Show the animated scan line (use for active/aguardando codes) */
  active?: boolean;
  className?: string;
}

/**
 * The signature element of Chegou: the pickup code rendered as a claim strip —
 * segmented mono digits under a dotted perforation, like a locker tag / terminal
 * readout. This is the one bold thing; everything around it stays quiet graphite.
 */
export function CodigoStrip({ codigo, size = "sm", active = false, className }: CodigoStripProps) {
  const chars = (codigo ?? "").split("");
  const lg = size === "lg";

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-center rounded-lg border border-border bg-muted/40 text-center",
        lg ? "gap-3 px-6 py-5" : "gap-1.5 px-3 py-2",
        className
      )}
    >
      {/* perforation */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 border-t border-dashed border-border/70"
      />
      <span className={cn("eyebrow", lg ? "text-xs" : "text-[10px]")}>Código de retirada</span>

      <div className={cn("relative overflow-hidden rounded-md", lg && "px-1")}>
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 animate-scan bg-gradient-to-b from-primary/40 to-transparent"
          />
        )}
        <div className={cn("flex items-center", lg ? "gap-2.5" : "gap-1")}>
          {chars.map((c, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center justify-center rounded-md border border-border bg-card font-mono font-bold tabular text-foreground animate-code-in",
                lg ? "h-14 w-11 text-3xl" : "h-8 w-6 text-lg"
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
