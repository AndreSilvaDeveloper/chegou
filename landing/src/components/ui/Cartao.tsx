import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { cn, vars } from '@/lib/css';
import { Icone, type NomeIcone } from './Icone';
import { PixelCanvas } from './PixelCanvas';
import './Cartao.css';

interface Props extends HTMLAttributes<HTMLElement> {
  /** Qual família de card — decide a superfície e o tamanho do ícone. */
  familia: 'dor' | 'tijolo' | 'perfil';
  icone: NomeIcone;
  /**
   * O `<article>` de dentro. Precisa chegar até o DOM porque quem envolve o
   * card (`Revelar`) observa esse nó para saber quando ele entra na tela —
   * componente que engole o `ref` some da página, já que o `.reveal` nasce em
   * `opacity: 0` e só o observador o traz de volta.
   */
  ref?: Ref<HTMLElement>;
  /**
   * Conteúdo que fica AO LADO do ícone, na mesma linha (caso do perfil, onde
   * papel e título acompanham a marca). Sem isso, o ícone ocupa a linha dele.
   */
  aoLado?: ReactNode;
  children: ReactNode;
}

/**
 * O card, com o tratamento que as famílias dividem: degradê no topo, fio de
 * luz na quina, borda que acende no hover e o ícone em marca-d'água ao fundo.
 *
 * A marca-d'água é o MESMO ícone do topo do card, repetido grande e apagado —
 * aqui é impossível divergir, os dois saem da mesma prop.
 *
 * `ref`, `className` e `style` são repassados ao `<article>`: o card precisa se
 * comportar como um elemento do DOM para poder ser envolvido por `Revelar`.
 */
export function Cartao({
  familia,
  icone,
  className,
  aoLado,
  children,
  ref,
  ...resto
}: Props): ReactElement {
  const marca = (
    <span className={`${familia}__marca`} aria-hidden="true">
      <Icone nome={icone} tamanho={familia === 'tijolo' ? 22 : 20} />
    </span>
  );

  return (
    <article ref={ref} className={cn(familia, className)} {...resto}>
      <span className="cartao__fundo" aria-hidden="true">
        <Icone nome={icone} tamanho={152} strokeWidth={1.1} />
      </span>
      {aoLado ? (
        <div className={`${familia}__topo`}>
          {marca}
          {aoLado}
        </div>
      ) : (
        marca
      )}
      {children}
    </article>
  );
}

/**
 * O card dos passos. Estrutura diferente o bastante para não caber no acima:
 * o "ícone" dele é um dígito, e ele precisa do índice para saber onde parar
 * na pilha.
 */
export function CartaoPasso({
  indice,
  tempo,
  emEvidencia,
  children,
}: {
  indice: number;
  tempo: string;
  /** É o cartão da frente da pilha? Só ele acende a malha de pixels. */
  emEvidencia: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <li className="passo" style={vars({ '--i': indice })}>
      {/* Antes da marca-d'água no DOM: as duas dividem a camada de fundo, e
          quem vem depois pinta por cima. */}
      <PixelCanvas ativo={emEvidencia} />
      <span className="cartao__fundo cartao__fundo--n" aria-hidden="true">
        {indice + 1}
      </span>
      <span className="passo__n" aria-hidden="true">
        {indice + 1}
      </span>
      <span className="passo__tempo">{tempo}</span>
      {children}
    </li>
  );
}
