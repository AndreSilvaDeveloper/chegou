import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VoltarSlot } from '@/components/ui/voltar-slot';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * Casca de uma tela de listagem/cadastro.
 *
 * ┌──── MOBILE ────────────┐        ┌──── DESKTOP ──────────────┐
 * │ ▓▓ menu · condo · você │ ← Layout │ sidebar │ menu · você    │
 * │ ▓▓ Apartamentos        │        │         │ Apartamentos    │
 * │ ▓▓ Listagem de …       │ ← aqui │         │ Listagem de …   │
 * │ ▓▓ [busca      ] [⚙]   │        │         │ [busca] [⚙][ações]│
 * ├────────────────────────┤        ├─────────┼─────────────────┤
 * │ ╭──────────────────╮   │        │         │ tabela          │
 * │ │ [ações]          │   │        │         │                 │
 * │ │ card             │   │        │         │                 │
 *
 * A faixa âmbar (▓) do celular é **uma coisa só** partida em dois arquivos: a
 * barra com menu/condomínio/avatar mora no `Layout`, e o título/busca moram
 * aqui. Elas encostam e viram um bloco contínuo porque o `<main>` do Layout não
 * tem padding nem fundo próprio no celular.
 *
 * POR QUE NÃO USA CONTEXT
 * A alternativa seria a página registrar o título num contexto e o `Layout`
 * desenhar tudo. Custaria um efeito por tela, ordem de montagem a acertar e
 * título piscando na troca de rota. Aqui a página desenha o que é dela, e o que
 * une as duas metades é só a cor de fundo — que vem do mesmo token (`--banner`).
 *
 * NO DESKTOP A FAIXA NÃO EXISTE: lá a sidebar já dá a identidade, e um bloco
 * âmbar daquela largura viraria a coisa mais pesada da tela. As mesmas
 * declarações (título, busca, ações) reaparecem como cabeçalho comum.
 */
export interface PageShellProps {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;

  /** Busca da tela. Sem isto, o campo não aparece. */
  busca?: {
    valor: string;
    aoMudar: (valor: string) => void;
    placeholder?: string;
  };

  /**
   * Conteúdo da gaveta de filtros. Sem isto, o botão de filtro não aparece —
   * botão que não faz nada ensina o usuário a ignorar a interface.
   */
  filtros?: React.ReactNode;
  /** Quantos filtros estão aplicados: vira o contador no botão. */
  filtrosAtivos?: number;
  /** Limpa todos os filtros — o botão só aparece com `filtrosAtivos > 0`. */
  aoLimparFiltros?: () => void;

  /** Botões de ação da tela (Importar CSV, Novo…). */
  acoes?: React.ReactNode;

  /**
   * Rota de volta. Numa tela de DETALHE ou FORMULÁRIO, o botão da esquerda da
   * barra do topo vira uma seta de voltar em vez do menu.
   *
   * Nessas telas normalmente **não se passa `description` nem `busca`**: o
   * título já é o registro (o código da encomenda) e não há lista para buscar.
   */
  voltar?: string;

  /**
   * A listagem está DENTRO de uma aba (`/admin/condominios/:id`,
   * `/meus-condominios/:id`), não é a tela inteira.
   *
   * Nesse caso não há faixa nem título: a aba já diz onde a pessoa está, e um
   * segundo "Apartamentos" com fundo âmbar no meio da página seria um cabeçalho
   * de tela dentro de outro. Sobram a busca, o filtro e as ações.
   */
  embutido?: boolean;

  children: React.ReactNode;
}

export function PageShell({
  icon: Icone,
  eyebrow,
  title,
  description,
  busca,
  filtros,
  filtrosAtivos = 0,
  aoLimparFiltros,
  acoes,
  voltar,
  embutido = false,
  children,
}: PageShellProps) {
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const campoBusca = busca && (
    <div className="relative flex-1 ">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={busca.valor}
        onChange={(e) => busca.aoMudar(e.target.value)}
        placeholder={busca.placeholder ?? 'Buscar…'}
        aria-label={busca.placeholder ?? 'Buscar'}
        className={cn(
          'h-[40px] w-full rounded-full border px-3 pl-9 txt-corpo text-foreground shadow-xs transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
          // Dentro da faixa o campo usa a superfície DELA (branco no claro), que
          // é o que o destaca do âmbar. No desktop, onde não há faixa, volta a
          // ser um campo comum sobre a folha.
          'border-banner-border bg-banner-surface',
          'md:border-input md:bg-background',
        )}
      />
    </div>
  );

  const botaoFiltro = filtros && (
    <Button
      variant="outline"
      size="icon"
      aria-label={filtrosAtivos > 0 ? `Filtros (${filtrosAtivos} ativos)` : 'Filtros'}
      onClick={() => setFiltrosAbertos(true)}
      className="relative shrink-0 w-[40px] h-[40px] rounded-full border-banner-border bg-banner-surface text-foreground md:border-input md:bg-background"
    >
      <SlidersHorizontal className="h-4 w-4" />
      {filtrosAtivos > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 txt-nota font-semibold text-primary-foreground">
          {filtrosAtivos}
        </span>
      )}
    </Button>
  );

  const gaveta = filtros && (
    <Sheet open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
      <SheetContent side="right" className="w-full sm:max-w-sm ">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Refine a lista sem perder a busca.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">{filtros}</div>
        <div className="mt-8 flex gap-2">
          {filtrosAtivos > 0 && aoLimparFiltros && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                aoLimparFiltros();
                setFiltrosAbertos(false);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Limpar
            </Button>
          )}
          <Button className="flex-1" onClick={() => setFiltrosAbertos(false)}>
            Ver resultados
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  if (embutido) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {(campoBusca || botaoFiltro) && (
            <div className="flex items-center gap-2 md:max-w-sm md:flex-1">
              {campoBusca}
              {botaoFiltro}
            </div>
          )}
          {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
        </div>
        {children}
        {gaveta}
      </div>
    );
  }

  return (
    <>
      {/* Troca o menu por uma seta de voltar na barra do topo, que mora no
          `Layout`. Não renderiza nada aqui. */}
      <VoltarSlot rota={voltar ?? null} />

      {/* ---- Faixa (celular) / cabeçalho comum (desktop) ---- */}
      <div
        className={cn(
          // `pb-8` contra o `-mt-6` da folha: os 24px de sobreposição são
          // exatamente o raio do `rounded-t-3xl`, então o arco do canto cai
          // inteiro sobre o âmbar. Com sobreposição menor que o raio, o pé do
          // arco revelava o fundo da página e o entalhe sumia.
          'bg-banner px-4 pb-12 text-banner-foreground',
          // No desktop a faixa se dissolve: sem cor, sem padding próprio.
          'md:bg-transparent md:px-0 md:pb-0 md:text-foreground',
        )}
      >
        <div className="flex flex-col gap-1 ">
          {eyebrow && (
            // <span className="eyebrow text-banner-foreground/70 md:text-muted-foreground">
            //   {eyebrow}
            // </span>
            <></>
          )}
          <h1 className="flex items-center gap-2 txt-titulo font-bold tracking-tight">
            {Icone && <Icone className="h-5 w-5 shrink-0 opacity-80" />}
            {title}
          </h1>
          {description && (
            <p className="text-xs text-banner-foreground/80 md:text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {(campoBusca || botaoFiltro) && (
          <div className="mt-3 flex items-center gap-2 md:max-w-lg">
            {campoBusca}
            {botaoFiltro}
          </div>
        )}

        {/* No desktop as ações ficam na mesma linha do cabeçalho. No celular
            elas descem para a folha branca, onde há largura para os rótulos. */}
        {acoes && <div className="mt-3 hidden flex-wrap gap-2 md:flex">{acoes}</div>}
      </div>

      {/* ---- A folha: sobe por cima da faixa com o canto arredondado ---- */}
      <div
        className={cn(
          // A FOLHA NÃO TEM ALTURA — cresce só com o conteúdo.
          //
          // Já teve `min-h-dvh` aqui, para ela alcançar o rodapé numa tela
          // curta. O efeito colateral era barra de rolagem em TODA tela: o
          // container de rolagem mede `100dvh − altura do header`, e o conteúdo
          // passava a medir `faixa + 100dvh`. Quem faz a folha parecer chegar ao
          // rodapé é o `bg-background` do container de rolagem (ver `Layout`).
          //
          // Uma extensão do editor também já injetou `h-dvh` aqui; se voltar,
          // trunca qualquer lista maior que a tela.
          '-mt-8 rounded-t-4xl bg-background px-4 pb-10 pt-5',
          'md:mt-6 md:rounded-none md:bg-transparent md:px-0 md:pb-0 md:pt-0',
        )}
      >
        {acoes && <div className="mb-4 flex flex-wrap gap-2 md:hidden">{acoes}</div>}
        {children}
      </div>

      {gaveta}
    </>
  );
}
