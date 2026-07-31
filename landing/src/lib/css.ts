import type { CSSProperties } from 'react';

/** Junta classes ignorando `false`, `null` e `undefined`. */
export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ');
}

/**
 * `style` com propriedades customizadas (`--i`, `--atraso`…).
 *
 * O tipo `CSSProperties` do React não aceita chaves que começam com `--`, mas
 * o DOM aceita e é assim que boa parte das animações desta página recebe os
 * parâmetros de cada instância. Este helper concentra o cast num lugar só, em
 * vez de espalhar `as CSSProperties` por todo componente.
 */
export function vars(valores: Record<string, string | number>): CSSProperties {
  return valores as CSSProperties;
}
