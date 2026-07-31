import type { ReactElement } from 'react';
import { vars } from '@/lib/css';
import { PacoteIso } from '@/components/ui/PacoteIso';
import './CaixasCaindo.css';

/**
 * Cada caixa com a sua profundidade.
 *
 * Os atrasos são NEGATIVOS de propósito: cada uma já entra no meio da própria
 * queda, então a cena nasce povoada em vez de começar vazia esperando a
 * primeira cair.
 *
 * `y` é onde ela para quando o movimento está desligado — sem isso, todas
 * congelariam no mesmo ponto.
 */
const CAIXAS = [
  { x: '6%',  tam: '82px',  desf: '5px',   dur: '27s', d: '-4s',  giro: '38deg',  op: 0.16, cor: 'var(--tinta)', y: '22vh' },
  { x: '17%', tam: '48px',  desf: '2px',   dur: '34s', d: '-19s', giro: '-24deg', op: 0.13, cor: 'var(--sinal)', y: '46vh' },
  { x: '29%', tam: '120px', desf: '9px',   dur: '23s', d: '-11s', giro: '22deg',  op: 0.10, cor: 'var(--tinta)', y: '63vh' },
  { x: '41%', tam: '60px',  desf: '3px',   dur: '31s', d: '-26s', giro: '-33deg', op: 0.12, cor: 'var(--tinta)', y: '31vh' },
  { x: '54%', tam: '94px',  desf: '7px',   dur: '38s', d: '-6s',  giro: '18deg',  op: 0.09, cor: 'var(--sinal)', y: '54vh' },
  { x: '66%', tam: '44px',  desf: '1.5px', dur: '25s', d: '-15s', giro: '-41deg', op: 0.16, cor: 'var(--tinta)', y: '16vh' },
  { x: '77%', tam: '108px', desf: '8px',   dur: '29s', d: '-22s', giro: '27deg',  op: 0.10, cor: 'var(--tinta)', y: '70vh' },
  { x: '88%', tam: '56px',  desf: '2.5px', dur: '36s', d: '-9s',  giro: '-19deg', op: 0.14, cor: 'var(--sinal)', y: '38vh' },
  { x: '95%', tam: '72px',  desf: '4px',   dur: '21s', d: '-30s', giro: '31deg',  op: 0.11, cor: 'var(--tinta)', y: '58vh' },
] as const;

/**
 * A chuva de caixas ao fundo do hero.
 *
 * Mesma geometria isométrica dos pacotes da cena principal, aqui só em
 * contorno. O DESFOQUE é o que cria profundidade: a mais borrada lê como
 * distante, a mais nítida como próxima.
 *
 * O blur é FIXO por caixa e só `transform`/`opacity` animam — com raio animado
 * o navegador refaria a rasterização a cada quadro; com raio fixo ele guarda a
 * camada borrada e apenas a desloca.
 *
 * Quem apaga as caixas no fim do hero é a MÁSCARA do contêiner, não o keyframe:
 * assim o desaparecimento acompanha a altura da seção em vez de depender da
 * duração de cada queda.
 */
export function CaixasCaindo(): ReactElement {
  return (
    <div className="chuva" aria-hidden="true">
      {CAIXAS.map((c, i) => (
        <span
          key={i}
          className="caixa"
          style={vars({
            '--x': c.x, '--tam': c.tam, '--esc': 1, '--desf': c.desf,
            '--dur': c.dur, '--d': c.d, '--giro': c.giro, '--op': c.op,
            '--cor': c.cor, '--y': c.y,
          })}
        >
          <PacoteIso />
        </span>
      ))}
    </div>
  );
}
