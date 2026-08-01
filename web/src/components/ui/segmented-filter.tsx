import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEGMENTO, SEGMENTO_ATIVO, TRILHO_SEGMENTADO } from '@/components/ui/tabs';

export interface OpcaoSegmento<T extends string> {
  valor: T;
  label: string;
  icone?: LucideIcon;
  /** Contagem ao lado do rótulo. `undefined` não mostra nada — `0` mostra "0". */
  contador?: number;
}

interface SegmentedFilterProps<T extends string> {
  valor: T;
  aoMudar: (valor: T) => void;
  opcoes: readonly OpcaoSegmento<T>[];
  /** Rótulo do grupo para leitor de tela: "Filtrar encomendas por situação". */
  aria: string;
  className?: string;
}

/**
 * Filtro segmentado: recorta UMA lista sem trocar de tela (Pendentes /
 * Retirados / Cancelados, Na fila / Enviados / Falhas).
 *
 * **Tem a mesma pele das abas** — as classes vêm de `components/ui/tabs.tsx`
 * (`TRILHO_SEGMENTADO`, `SEGMENTO`, `SEGMENTO_ATIVO`), e é isso que impede as
 * duas peças de divergirem com o tempo. O que muda é a semântica:
 *
 * - **Aba** (`Tabs`) troca o CONTEÚDO: cada aba tem o seu painel. Radix cuida
 *   de `role="tab"`, das setas do teclado e do vínculo com o painel.
 * - **Filtro** (aqui) mantém o conteúdo e muda o RECORTE. São botões de estado,
 *   com `aria-pressed` — anunciar isso como aba mentiria para o leitor de tela,
 *   porque não existe painel do outro lado.
 *
 * Na dúvida: se ao clicar você troca o que a tela mostra, é aba; se você filtra
 * a mesma lista, é filtro.
 *
 * ```tsx
 * const FILTROS = [
 *   { valor: 'pendentes', label: 'Pendentes' },
 *   { valor: 'retirados', label: 'Retirados' },
 * ] as const;
 *
 * <SegmentedFilter
 *   aria="Filtrar encomendas por situação"
 *   valor={filtro}
 *   aoMudar={setFiltro}
 *   opcoes={FILTROS}
 * />
 * ```
 */
export function SegmentedFilter<T extends string>({
  valor,
  aoMudar,
  opcoes,
  aria,
  className,
}: SegmentedFilterProps<T>) {
  return (
    <div role="group" aria-label={aria} className={cn(TRILHO_SEGMENTADO, className)}>
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor;
        const Icone = opcao.icone;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar(opcao.valor)}
            className={cn(SEGMENTO, ativo && SEGMENTO_ATIVO)}
          >
            {Icone && <Icone />}
            <span>{opcao.label}</span>
            {opcao.contador !== undefined && (
              // A contagem é apoio: fica apagada mesmo no segmento selecionado,
              // senão dois pesos disputam a mesma pílula.
              <span className="tabular txt-nota text-muted-foreground">{opcao.contador}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
