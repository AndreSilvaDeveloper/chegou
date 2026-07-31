import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Superfície de conteúdo.
 *
 * QUEM SEPARA O CARD DO FUNDO É A SOMBRA, NÃO A BORDA. `border-surface` é quase
 * invisível no claro (existe só para o card não sumir em tela muito clara) e no
 * escuro assume o contorno, porque lá sombra não aparece — preto sobre preto não
 * separa nada.
 *
 * Consequência prática: **card dentro de card é proibido**. Duas sombras
 * empilhadas viram sujeira, e o aninhamento era o que deixava a tela pesada.
 * Para agrupar dentro de um card, use `bg-muted rounded-lg` (bloco chapado, sem
 * sombra e sem borda) — ver "Blocos dentro do card" no CLAUDE.md.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-surface border border-border-surface bg-card text-card-foreground shadow-panel transition-colors",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-5 md:p-6", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("txt-secao font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("txt-apoio text-muted-foreground", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

// Padding simétrico por padrão — vale para cards SEM header (o caso mais comum).
// Cards COM header devem passar `pt-0 md:pt-0` para o conteúdo colar no título.
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 md:p-6", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-5 pt-0 md:p-6 md:pt-0", className)}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
