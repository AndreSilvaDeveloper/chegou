import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/**
 * Um registro de lista apresentado como card. É a forma que as listas do painel
 * assumem no CELULAR, onde tabela não cabe — e também o card das listas que já
 * nascem em grade no desktop (Vagas).
 *
 * Por que não deixar a tabela rolar na horizontal: numa tabela de 5 colunas em
 * 375px, o porteiro vê o nome e precisa arrastar para descobrir o telefone —
 * e some o nome. O card mostra o registro inteiro de uma vez, que é como ele
 * lê: um morador por vez, não uma planilha.
 *
 * ANATOMIA (a mesma em toda lista, e é isso que faz as telas parecerem irmãs)
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ┌──┐ Título forte        [selo]  [ações] │  ← identifica o registro
 *   │ │ic│ subtítulo apagado                   │
 *   │ └──┘                                     │
 *   │ ▫ RÓTULO           ▫ RÓTULO              │  ← campos em duas colunas:
 *   │   valor                valor             │    rótulo eyebrow em cima,
 *   │ [ rodapé: ações largas ]                 │    valor legível embaixo
 *   └──────────────────────────────────────────┘
 *
 * TRÊS NÍVEIS DE LEITURA, nesta ordem — é o que dá a hierarquia:
 *
 * 1. **Título** — o que identifica (nome do morador, `A-101`, `Vaga 12`).
 * 2. **Subtítulo** — a segunda coisa que a pessoa procura para ter certeza de
 *    que é aquele registro (a unidade do morador, o tipo da vaga). Apagado, e
 *    por isso não briga com o título.
 * 3. **Campos** — o resto, com o rótulo em `eyebrow` (mono maiúsculo pequeno)
 *    fazendo o papel do cabeçalho da tabela. Sem ele, o card vira uma lista de
 *    valores sem nome. Um campo pode pedir `enfase` quando é o dado que a tela
 *    existe para mostrar (o valor do aluguel, o total do mês).
 *
 * O ícone entra em bloco chapado (`bg-muted`, sem borda e sem sombra — card
 * dentro de card é proibido): ele dá o ponto de ancoragem visual que faz a
 * lista ser varrida de relance, em vez de lida linha a linha.
 *
 * Com `to`, o card inteiro vira o link para o detalhe (seta ao lado do título):
 * o alvo de toque passa a ser o card, não um "ver mais" de 14px.
 */
export interface CampoListCard {
  rotulo: string;
  valor: React.ReactNode;
  /** Ícone do rótulo — ajuda a achar o campo sem ler (telefone, unidade…). */
  icone?: LucideIcon;
  /** `inteira` ocupa as duas colunas — use em texto longo (e-mail, observação). */
  largura?: 'meia' | 'inteira';
  /** O dado principal do registro: sobe de tamanho e ganha peso. Use com parcimônia. */
  enfase?: boolean;
}

export interface ListCardProps {
  icone?: LucideIcon;
  /**
   * Card inteiro vira link para o detalhe: aparece a seta ao lado do título e o
   * card responde ao hover. É a área de toque que o celular precisa — alvo do
   * tamanho do card, não de um "ver mais" de 14px.
   */
  to?: string;
  titulo: React.ReactNode;
  /** Segunda linha, apagada: o que confirma de qual registro se trata. */
  subtitulo?: React.ReactNode;
  /** Badge ao lado do título (Principal, Você, Ativo…). */
  selo?: React.ReactNode;
  campos?: CampoListCard[];
  /** Botões de ação, no canto superior direito. Só ícone — o rodapé é para ação com texto. */
  acoes?: React.ReactNode;
  /**
   * Conteúdo no canto superior direito que **não** é botão (o código de
   * retirada da encomenda, um valor em destaque). Slot separado de `acoes`
   * porque lá as margens negativas alinham o ícone do botão com a borda do
   * card — aplicadas a um bloco, desalinham.
   */
  destaque?: React.ReactNode;
  /** Ações largas no pé do card (Editar, Histórico…), quando ícone não basta. */
  rodape?: React.ReactNode;
  /** Registro inativo: baixa o contraste do card inteiro sem escondê-lo. */
  atenuado?: boolean;
  className?: string;
}

export function ListCard({
  icone: Icone,
  to,
  titulo,
  subtitulo,
  selo,
  campos = [],
  acoes,
  destaque,
  rodape,
  atenuado = false,
  className,
}: ListCardProps) {
  const card = (
    <Card
      className={cn(
        // `flex flex-col` + `mt-auto` no rodapé: numa grade, os cards de uma
        // linha esticam para a mesma altura e as ações ficam alinhadas embaixo
        // em vez de flutuarem no meio do card mais curto.
        'flex h-full flex-col p-4',
        // Sem realce âmbar: o card clicável se anuncia pela elevação e pela
        // borda, que é o mesmo vocabulário do resto do painel.
        to && 'transition-shadow group-hover:border-border group-hover:shadow-panel-lg',
        atenuado && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {Icone && (
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          >
            <Icone className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate txt-subtitulo font-semibold tracking-tight">{titulo}</span>
            {to && (
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            )}
            {selo}
          </div>
          {subtitulo && (
            <div className="mt-0.5 truncate txt-apoio text-muted-foreground">{subtitulo}</div>
          )}
        </div>

        {destaque && <div className="shrink-0">{destaque}</div>}
        {acoes && <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">{acoes}</div>}
      </div>

      {campos.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {campos.map((campo) => {
            const CampoIcone = campo.icone;
            const inteira = campo.largura === 'inteira';
            return (
              <div key={campo.rotulo} className={cn('min-w-0', inteira && 'col-span-2')}>
                <dt className="flex items-center gap-1.5 eyebrow">
                  {CampoIcone && <CampoIcone className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{campo.rotulo}</span>
                </dt>
                <dd
                  className={cn(
                    'mt-1',
                    campo.enfase ? 'txt-numero-sm font-semibold' : 'txt-corpo',
                    // Campo de meia largura corta com reticências; o de largura
                    // inteira existe justamente para texto longo, então quebra
                    // linha — truncar ali escondia a observação inteira.
                    inteira ? 'break-words' : 'truncate',
                  )}
                >
                  {campo.valor}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {rodape && <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row">{rodape}</div>}
    </Card>
  );

  if (!to) return card;

  return (
    <Link to={to} className="group block h-full">
      {card}
    </Link>
  );
}

/**
 * Empilhamento padrão dos `ListCard` no celular.
 *
 * Existe para o espaçamento entre cards não ser reinventado a cada tela: com
 * sombra em volta, cards muito juntos borram a separação e muito longe soltam
 * a lista.
 */
export function ListCardStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-3', className)}>{children}</div>;
}
