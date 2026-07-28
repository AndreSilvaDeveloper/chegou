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
          // `txt-corpo` já traz 16px no celular / 14px no desktop — é o mesmo par
          // que estava aqui à mão, agora vindo da escala (ver styles.css).
          // Exceção: `file:` é variante do Tailwind e só alcança utilitário, não
          // classe da escala — por isso o botão do seletor de arquivo fica solto.
          "flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2.5 txt-corpo shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 md:h-10",
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
