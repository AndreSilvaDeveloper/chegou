'use client';

import { cloneElement, type ReactElement } from 'react';
import { cn } from '@/lib/css';
import { useEmVista } from '@/hooks/use-em-vista';

interface Props {
  /** Um único elemento — a classe é aplicada NELE, sem embrulho extra. */
  children: ReactElement<{ className?: string }>;
  /** Escadinha curta dentro do mesmo bloco, em ms. */
  atraso?: number;
}

/**
 * Aparece ao entrar na tela. Uma vez só.
 *
 * Clona o filho em vez de envolvê-lo numa `<div>`: um embrulho a mais quebraria
 * o `gap` do flex do pai e mudaria o espaçamento de quem usa.
 *
 * O PREÇO DISSO É UM CONTRATO: o filho tem de repassar `ref`, `className` e
 * `style` até um nó real do DOM. Componente que engole o `ref` nunca é
 * observado, `visivel` nunca vira true e ele fica invisível para sempre — o
 * `.reveal` nasce em `opacity: 0`. Foi exatamente o que aconteceu com o
 * `Cartao` quando ele ainda não aceitava `ref`.
 */
export function Revelar({ children, atraso = 0 }: Props): ReactElement {
  const [ref, visivel] = useEmVista<HTMLElement>({
    umaVez: true,
    margem: '0px 0px -12% 0px',
    limiar: 0.08,
  });

  return cloneElement(children, {
    ref,
    className: cn('reveal', visivel && 'visivel', children.props.className),
    style: { ...(children.props as { style?: object }).style, transitionDelay: `${atraso}ms` },
  } as Partial<typeof children.props>);
}
