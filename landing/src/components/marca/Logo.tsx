import type { ReactElement } from 'react';
/**
 * A logo, como arquivo.
 *
 * É o mesmo PNG do painel (`web/public/icon-512.png`), copiado para
 * `public/logo.png` — sem redesenho, sem vetor equivalente. Existia aqui uma
 * reconstrução em SVG que permitia colorir por `currentColor`; ela foi
 * descartada de propósito: a arte oficial é esta, e uma cópia por mais fiel
 * que seja é mais uma coisa para divergir do original.
 *
 * O âmbar de fundo vem na própria imagem, então quem a usa não precisa (e não
 * deve) desenhar um selo colorido por trás.
 */
export function Logo({ className }: { className?: string }): ReactElement {
  return <img className={className} src="/logo.png" alt="" aria-hidden="true" width={512} height={512} />;
}
