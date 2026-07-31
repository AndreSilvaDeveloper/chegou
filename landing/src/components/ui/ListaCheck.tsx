import type { ReactElement } from 'react';
import { Icone } from './Icone';
import './ListaCheck.css';

/** Lista de itens confirmados — o check verde é semântico, não o sinal âmbar. */
export function ListaCheck({ itens }: { itens: readonly string[] }): ReactElement {
  return (
    <ul className="lista-check">
      {itens.map((item) => (
        <li key={item}>
          <Icone nome="check" tamanho={15} strokeWidth={3} />
          {item}
        </li>
      ))}
    </ul>
  );
}
