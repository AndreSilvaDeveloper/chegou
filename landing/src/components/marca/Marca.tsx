import type { ReactElement } from 'react';
import { Logo } from './Logo';
import { MARCA } from '@/lib/conteudo';

/**
 * A logo + a palavra da marca. Aparece no topo e no rodapé.
 *
 * O nome vem do `conteudo.ts`: renomear o produto é editar uma linha lá.
 */
export function Marca(): ReactElement {
  return (
    <a className="marca" href="#topo" aria-label={`${MARCA.completo} — início`}>
      <span className="marca__selo">
        <Logo className="marca__logo" />
      </span>
      <span>
        <span className="marca__nome">{MARCA.nome}</span>
        <span className="marca__sufixo">{MARCA.sufixo}</span>
      </span>
    </a>
  );
}
