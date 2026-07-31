import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/**
 * Caixa de seleção. Mesma abordagem do `Switch`: sem dependência nova, só um
 * `button` com `role="checkbox"` — o Radix entraria para resolver o que aqui
 * são cinco linhas.
 *
 * O quadrado tem 24px, mas quem o usa deve envolvê-lo num `<label>`: o alvo de
 * clique é a linha inteira, não o quadradinho (ver `CheckboxField` abaixo).
 */
const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, onCheckedChange, id, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background",
        className
      )}
      {...props}
    >
      {checked && <Check className="h-4 w-4" strokeWidth={3} />}
    </button>
  )
);
Checkbox.displayName = "Checkbox";

export interface CheckboxFieldProps extends CheckboxProps {
  /** Texto ao lado da caixa — clicar nele também marca. */
  label: React.ReactNode;
  /** Explicação abaixo do texto, quando a escolha tem consequência. */
  description?: React.ReactNode;
}

/**
 * Caixa + texto na mesma linha, com o texto clicável.
 *
 * É a forma que se usa nas telas: caixa solta obriga a acertar os 24px do
 * quadradinho com o polegar, em pé, no celular.
 */
function CheckboxField({
  label,
  description,
  id,
  className,
  disabled,
  ...props
}: CheckboxFieldProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const descId = description ? `${inputId}-desc` : undefined;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Checkbox id={inputId} disabled={disabled} aria-describedby={descId} {...props} />
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={inputId}
          onClick={(e) => {
            // O alvo é um `button`, não um `input` — o `htmlFor` sozinho não
            // alterna nada, então o clique no texto é traduzido aqui.
            e.preventDefault();
            if (!disabled) props.onCheckedChange(!props.checked);
          }}
          className={cn(
            "txt-corpo cursor-pointer font-medium leading-tight text-foreground select-none",
            disabled && "cursor-not-allowed opacity-70"
          )}
        >
          {label}
        </label>
        {description && (
          <span id={descId} className="txt-apoio text-muted-foreground">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}

export { Checkbox, CheckboxField };
