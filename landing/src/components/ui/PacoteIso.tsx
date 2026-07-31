import type { ReactElement } from 'react';

/**
 * O pacote isométrico em contorno — o mesmo desenho que cai ao fundo do hero.
 *
 * Estava copiado em dois lugares e agora ia para um terceiro; a geometria é
 * exatamente a mesma, e três cópias são três lugares para divergir quando o
 * traço mudar.
 *
 * A fita leva classe própria mas NÃO cor: quem a usa decide se ela é âmbar ou
 * acompanha o resto do contorno. No fundo do hero ela é discreta; na grade da
 * chamada é ela que dá o sinal.
 */
export function PacoteIso({
  className,
  traco = 2.4,
}: {
  className?: string;
  traco?: number;
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox="-32 -20 64 70"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <polygon points="-26,0 0,14 0,44 -26,30" />
      <polygon points="26,0 0,14 0,44 26,30" />
      <polygon points="-26,0 0,-14 26,0 0,14" />
      <polyline className="pacote__fita" points="-17.2,-4.8 8.8,9.2 17.2,4.8 -8.8,-9.2 -17.2,-4.8" />
    </svg>
  );
}
