import type { ReactElement } from 'react';
import './TextoBrilho.css';

/**
 * A frase com luz passando por trás.
 *
 * SEM JAVASCRIPT NENHUM — todo o efeito é CSS (ver `TextoBrilho.css`). A
 * referência roda `useAnimationFrame` e escreve `backgroundPosition` sessenta
 * vezes por segundo para descrever um movimento constante, que é exatamente o
 * que uma keyframe faz sozinha e fora da main thread.
 *
 * O componente existe só para dar um nome ao papel: é a frase destacada do
 * subtítulo, marcada com `**` no arquivo de conteúdo.
 */
export function TextoBrilho({ texto }: { texto: string }): ReactElement {
  return <strong className="brilho">{texto}</strong>;
}
