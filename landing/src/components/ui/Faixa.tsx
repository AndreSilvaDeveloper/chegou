import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/css';
import { Separador } from '@/components/layout/Separador';

interface Props {
  id?: string;
  /** Faixa de conteúdo (`card`) ou de trabalho (`papel`, o padrão). */
  tom?: 'papel' | 'card';
  /** A primeira faixa depois do hero também leva separador; só o hero não tem. */
  separador?: boolean;
  children: ReactNode;
}

/**
 * Uma seção da página.
 *
 * Concentra três coisas que antes eram repetidas em toda `<section>`: o
 * respiro vertical, a alternância de superfície e o separador na costura. Uma
 * seção nova não precisa lembrar de nada disso — e é impossível esquecer o
 * separador em uma delas.
 */
export function Faixa({ id, tom = 'papel', separador = true, children }: Props): ReactElement {
  return (
    <section id={id} className={cn('faixa', tom === 'card' && 'faixa--card')}>
      {separador && <Separador />}
      <div className="wrap">{children}</div>
    </section>
  );
}
