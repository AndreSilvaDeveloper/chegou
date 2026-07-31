import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // bg-background: o campo é uma superfície própria na hierarquia — no
          // claro fica acima do card (convida a escrever), no escuro afunda nele.
          // `txt-corpo` traz os 14px da escala em qualquer viewport (styles.css).
          // Exceção: `file:` é variante do Tailwind e só alcança utilitário, não
          // classe da escala — por isso o botão do seletor de arquivo fica solto.
          "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 txt-corpo shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
