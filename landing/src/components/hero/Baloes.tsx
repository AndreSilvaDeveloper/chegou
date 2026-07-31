import type { ReactElement } from 'react';
import { vars } from '@/lib/css';
import { Icone, type NomeIcone } from '@/components/ui/Icone';
import { BALOES } from '@/lib/conteudo';
import './Baloes.css';

/** Um recado a cada 3s dentro de um ciclo de 15s. */
const PASSO_S = 3;

/**
 * Os recados que giram em volta da caixa, narrando o fluxo.
 *
 * O escalonamento é `animation-delay`, não cinco conjuntos de keyframes: em
 * laço infinito o atraso só desloca a fase, então um conjunto serve a todos e
 * ninguém sai de compasso. Cada um fica ~5,7s no ar e as janelas se cruzam,
 * então há sempre dois na tela — um entrando enquanto o outro apaga.
 *
 * O ciclo é próprio (15s) e não o da caixa (5,6s): cinco recados nesse tempo
 * viraria pisca-pisca.
 */
export function Baloes(): ReactElement {
  return (
    <>
      {BALOES.map((balao, i) => (
        <span
          key={balao.titulo}
          className={`balao balao--${i + 1}`}
          style={vars({ '--atraso': `${i * PASSO_S}s` })}
          aria-hidden="true"
        >
          <span className="balao__icone">
            <Icone nome={balao.icone as NomeIcone} tamanho={15} strokeWidth={2.2} />
          </span>
          <span className="balao__texto">
            <b>{balao.titulo}</b>
            <small>{balao.apoio}</small>
          </span>
        </span>
      ))}
    </>
  );
}
