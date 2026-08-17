import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, id, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  )
);
Switch.displayName = "Switch";

export interface SwitchFieldProps extends SwitchProps {
  /** Texto à esquerda — clicar nele também alterna. */
  label: React.ReactNode;
  /** Explicação abaixo do texto, quando a escolha tem consequência. */
  description?: React.ReactNode;
}

/**
 * Rótulo à esquerda, interruptor à direita, a linha inteira clicável.
 *
 * Irmão do `CheckboxField`: mesma informação, outro gesto. Use quando a escolha
 * é o **estado de um recurso** ("recebe WhatsApp?", "é o contato principal?") —
 * o interruptor lê como um ajuste da unidade, e não precisa de moldura em volta
 * para se separar dos campos acima. Item marcado numa lista continua sendo
 * `CheckboxField`.
 *
 * O `<label>` não envolve o interruptor de propósito: ele é um `button`, e
 * `button` dentro de `label` (ou de outro `button`) é HTML inválido — por isso
 * o clique no texto é traduzido aqui, como no `CheckboxField`.
 */
function SwitchField({
  label,
  description,
  id,
  className,
  disabled,
  ...props
}: SwitchFieldProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const descId = description ? `${inputId}-desc` : undefined;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <label
        htmlFor={inputId}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) props.onCheckedChange(!props.checked);
        }}
        className={cn(
          "flex min-w-0 flex-col gap-0.5 select-none",
          disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
        )}
      >
        <span className="txt-corpo font-medium leading-tight text-foreground">{label}</span>
        {description && (
          <span id={descId} className="txt-apoio text-muted-foreground">
            {description}
          </span>
        )}
      </label>
      <Switch id={inputId} disabled={disabled} aria-describedby={descId} {...props} />
    </div>
  );
}

export { Switch, SwitchField };
