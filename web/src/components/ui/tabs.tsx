import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * TRILHO E SEGMENTO — a pele compartilhada dos controles segmentados.
 *
 * Duas peças usam exatamente estas classes:
 *
 * | Peça | Quando usar |
 * |---|---|
 * | `Tabs` (aqui) | Abas de verdade: cada uma mostra um CONTEÚDO diferente (Vagas / Locações / Cobranças) |
 * | `SegmentedFilter` | Filtro sobre UMA lista: o conteúdo é o mesmo, muda o recorte (Pendentes / Retirados) |
 *
 * Elas existem separadas porque a semântica é outra — aba é navegação (Radix
 * cuida de `role="tab"`, setas do teclado e do painel), filtro é um grupo de
 * botões de estado. Mas a aparência é UMA só, e mora nestas constantes: mudar o
 * desenho do controle segmentado é mexer aqui, não em sete telas.
 *
 * DECISÕES QUE PARECEM DETALHE E NÃO SÃO
 *
 * - **`rounded-full`** no trilho e no segmento, como o resto do sistema.
 * - **Uma linha só, que ROLA na horizontal quando não cabe.** Nunca
 *   `grid-cols-N` (coluna fixa espreme "Pendentes" e "Cancelados" em 375px) e
 *   nunca `flex-wrap`: quebrar linha era pior que rolar — num S24 Ultra sobrava
 *   "Todos" sozinho numa segunda fita, e o controle parecia quebrado. Com
 *   `flex-nowrap` + `overflow-x-auto` o trilho só rola quando precisa; cabendo,
 *   fica parado e ninguém percebe que ele rolaria.
 * - A barra de rolagem fica escondida (`rolagem-sem-barra`) — barra dentro de
 *   uma pílula arredondada é sujeira. Quem dá a pista de que há mais é o
 *   segmento cortado na borda, e o `SegmentedFilter` ainda traz o selecionado
 *   para a vista sozinho.
 * - **O selecionado NÃO é âmbar.** O sinal é reservado para a ação, e nessas
 *   telas o botão âmbar de ação fica logo acima do controle — dois âmbares na
 *   mesma dobra e o botão deixa de ser o que salta. Quem marca é o degrau de
 *   tom entre `--segmented` (trilho) e `--segmented-active` (pílula).
 * - **Os dois tons são tokens próprios, não `--muted`/`--card`.** O controle
 *   aparece sobre o card E sobre a folha; amarrado a `--muted` ele lia como
 *   "mais escuro" dentro do card e como "mais claro" na folha, onde a pílula
 *   selecionada praticamente sumia. No escuro o degrau inverte de propósito:
 *   trilho cinza (#262626) e pílula quase preta.
 * - **Sem altura forçada**: a altura sai do padding, como em todo controle do
 *   shadcn (regra 17).
 */
export const TRILHO_SEGMENTADO =
  "flex w-full max-w-full flex-nowrap items-center gap-1 overflow-x-auto rolagem-sem-barra scroll-smooth rounded-full bg-segmented p-1 text-muted-foreground"

// O `ring-offset` é o do TRILHO, não o da página: o respiro entre o anel de
// foco e a pílula é pintado por cima do trilho, e com a cor do fundo ele virava
// um halo de outro tom.
export const SEGMENTO =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 txt-corpo font-medium ring-offset-segmented transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0"

/**
 * O segmento selecionado. Existe em duas versões porque o Tailwind precisa da
 * classe escrita por extenso — não dá para montar `data-[state=active]:` em
 * tempo de execução. **Alterou uma, altere a outra.**
 */
export const SEGMENTO_ATIVO = "bg-segmented-active text-foreground shadow-panel"

const SEGMENTO_ATIVO_DATA =
  "data-[state=active]:bg-segmented-active data-[state=active]:text-foreground data-[state=active]:shadow-panel"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(TRILHO_SEGMENTADO, className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(SEGMENTO, SEGMENTO_ATIVO_DATA, className)}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
