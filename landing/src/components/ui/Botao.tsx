import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/css';
import './Botao.css';

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variante?: 'sinal' | 'linha';
  grande?: boolean;
  children: ReactNode;
}

/**
 * Botão de ação. É sempre um link: nesta página toda ação leva a algum lugar
 * (uma âncora ou o e-mail), nenhuma dispara comportamento no cliente.
 *
 * A altura mínima de 48px vem do CSS e não é negociável — é o alvo de toque
 * do porteiro, a regra que o design system do projeto trata como fundamento.
 */
export function Botao({
  variante = 'sinal',
  grande = false,
  className,
  children,
  ...resto
}: Props): ReactElement {
  return (
    <a
      className={cn('btn', `btn--${variante}`, grande && 'btn--g', className)}
      {...resto}
    >
      {children}
    </a>
  );
}
