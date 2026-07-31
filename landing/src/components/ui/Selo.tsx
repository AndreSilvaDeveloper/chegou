import type { ReactElement, ReactNode } from 'react';
import './Selo.css';

/**
 * Pílula de estado, com um ponto verde à esquerda.
 *
 * Nasceu no hero e sobreviveu à remoção dele porque o recibo do preço usa a
 * mesma peça ("sem fidelidade"). O verde é semântico — confirmação — e por
 * isso não é o âmbar, que nesta página significa ação e foco.
 */
export function Selo({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="selo">
      <span className="ponto" aria-hidden="true" />
      {children}
    </span>
  );
}
