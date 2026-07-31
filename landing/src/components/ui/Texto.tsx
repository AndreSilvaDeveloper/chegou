import { Fragment, type ReactElement } from 'react';
import { TextoBrilho } from './TextoBrilho';

/**
 * Renderiza o `**destaque**` do arquivo de conteúdo como `<strong>`.
 *
 * Existe para o `conteudo.ts` continuar sendo DADO: sem isso a copy teria de
 * carregar JSX (e virar `.tsx`) ou passar por `dangerouslySetInnerHTML` — o
 * primeiro fecha o arquivo para quem não escreve React, o segundo abre a porta
 * para injeção de HTML sem necessidade nenhuma.
 *
 * A cor do destaque é do CSS (`.t-apoio strong`), não daqui: no original ela
 * vinha de um `style="color:var(--tinta)"` repetido em cada parágrafo.
 */
export function Texto({
  children,
  brilho = false,
}: {
  children: string;
  /**
   * Passa um brilho pelo trecho em destaque. O marcador `**` do conteúdo já
   * diz QUAL frase é — não é preciso um segundo lugar para apontá-la.
   */
  brilho?: boolean;
}): ReactElement {
  const partes = children.split('**');
  return (
    <>
      {partes.map((parte, i) => {
        // Índice ímpar = trecho entre os pares de asteriscos.
        if (i % 2 === 0) return <Fragment key={i}>{parte}</Fragment>;
        return brilho ? (
          <TextoBrilho key={i} texto={parte} />
        ) : (
          <strong key={i}>{parte}</strong>
        );
      })}
    </>
  );
}
