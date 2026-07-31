import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/**
 * Um registro de lista apresentado como card. É a forma que as listas do painel
 * assumem no CELULAR, onde tabela não cabe.
 *
 * Por que não deixar a tabela rolar na horizontal: numa tabela de 5 colunas em
 * 375px, o porteiro vê o nome e precisa arrastar para descobrir o telefone —
 * e some o nome. O card mostra o registro inteiro de uma vez, que é como ele
 * lê: um morador por vez, não uma planilha.
 *
 * ANATOMIA (a mesma em toda lista, e é isso que faz as telas parecerem irmãs)
 *
 *   ┌─────────────────────────────────────────┐
 *   │ [ícone] Título forte      [selo]  [ações]│   ← identifica o registro
 *   │                                          │
 *   │ RÓTULO apagado      RÓTULO apagado       │   ← campos em duas colunas:
 *   │ valor forte         valor forte          │     rótulo pequeno em cima,
 *   └─────────────────────────────────────────┘     valor legível embaixo
 *
 * O par rótulo-pequeno-apagado sobre valor-forte é o que substitui o cabeçalho
 * da tabela: sem ele, o card vira uma lista de valores sem nome.
 */
export interface CampoListCard {
  rotulo: string;
  valor: React.ReactNode;
  /** `inteira` ocupa as duas colunas — use em texto longo (e-mail, observação). */
  largura?: 'meia' | 'inteira';
}

export interface ListCardProps {
  icone?: LucideIcon;
  titulo: React.ReactNode;
  /** Badge ao lado do título (Principal, Você, Ativo…). */
  selo?: React.ReactNode;
  campos?: CampoListCard[];
  /** Botões de ação, no canto superior direito. */
  acoes?: React.ReactNode;
  /** Registro inativo: baixa o contraste do card inteiro sem escondê-lo. */
  atenuado?: boolean;
  className?: string;
}

export function ListCard({
  icone: Icone,
  titulo,
  selo,
  campos = [],
  acoes,
  atenuado = false,
  className,
}: ListCardProps) {
  return (
    <Card className={cn('p-4', atenuado && 'opacity-60', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {Icone && <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate txt-subtitulo font-semibold">{titulo}</span>
          {selo}
        </div>
        {acoes && <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">{acoes}</div>}
      </div>

      {campos.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {campos.map((campo) => (
            <div
              key={campo.rotulo}
              className={cn('min-w-0', campo.largura === 'inteira' && 'col-span-2')}
            >
              <dt className="txt-nota uppercase tracking-wide text-muted-foreground">
                {campo.rotulo}
              </dt>
              <dd className="mt-0.5 truncate txt-corpo">{campo.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
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
