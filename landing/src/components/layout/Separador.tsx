import type { ReactElement } from 'react';
import { Logo } from '@/components/marca/Logo';
import { useEmVista } from '@/hooks/use-em-vista';
import './Separador.css';

/**
 * A costura entre duas seções: dois pulsos correndo para o centro e a marca
 * pulsando no encontro — a mesma frase que o hero conta, como pontuação.
 *
 * O CSS nasce com as animações PAUSADAS e só o separador em vista as solta.
 * São oito na página; oito rotas e oito halos rodando ao mesmo tempo seria
 * motor ligado à toa, e na prática nunca se vê mais de um.
 */
export function Separador(): ReactElement {
  const [ref, visivel] = useEmVista<HTMLDivElement>({ limiar: 0 });

  return (
    <div ref={ref} className="separador" data-vivo={visivel ? 'sim' : 'nao'} aria-hidden="true">
      <span className="separador__linha separador__linha--esq" />
      <span className="separador__marca">
        <Logo className="separador__logo" />
      </span>
      <span className="separador__linha separador__linha--dir" />
    </div>
  );
}
