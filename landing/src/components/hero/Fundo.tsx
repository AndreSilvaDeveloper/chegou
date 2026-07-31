import type { ReactElement } from 'react';
import { vars } from '@/lib/css';
import './Fundo.css';

/**
 * Volumes à deriva. A referência (ShapeHero) usa oito matizes de arco-íris;
 * aqui são DOIS — o âmbar do sinal e a tinta do tema — porque a página inteira
 * se sustenta em um sinal só, e oito matizes transformariam o fundo no assunto.
 *
 * Usando `var(--tinta)` nas formas neutras, elas acompanham claro e escuro
 * sozinhas.
 */
const FORMAS = [
  { l: '-14%', t: '-16%', w: 'min(320px,42vw)', h: 'min(520px,62vh)', r: '28px', giro: '-8deg',  atraso: '.25s', tom: 'var(--sinal)' },
  { r_: '-18%', b: '-8%', w: 'min(620px,66vw)', h: 'min(220px,26vh)', r: '24px', giro: '14deg',  atraso: '.45s', tom: 'var(--tinta)' },
  { l: '-6%',  t: '44%',  w: 'min(300px,38vw)', h: 'min(300px,38vh)', r: '36px', giro: '22deg',  atraso: '.35s', tom: 'var(--tinta)' },
  { r_: '8%',  t: '2%',   w: 'min(280px,34vw)', h: 'min(110px,14vh)', r: '16px', giro: '-19deg', atraso: '.6s',  tom: 'var(--sinal)' },
  { r_: '-12%', t: '46%', w: 'min(420px,48vw)', h: 'min(160px,20vh)', r: '20px', giro: '33deg',  atraso: '.7s',  tom: 'var(--sinal)' },
  { l: '22%',  b: '6%',   w: 'min(210px,26vw)', h: 'min(210px,26vh)', r: '30px', giro: '-24deg', atraso: '.2s',  tom: 'var(--tinta)' },
] as const;

/**
 * As camadas de fundo do hero, da mais distante à mais próxima.
 *
 * Sem `filter: blur` e sem `backdrop-filter`, ao contrário da referência:
 * desfoque em elemento animado obriga o navegador a rasterizar de novo a cada
 * quadro, e são seis formas grandes. A maciez vem do próprio degradê radial,
 * que é de graça.
 *
 * Duas animações aninhadas: a de fora faz a entrada (cai, gira e aparece uma
 * vez), a de dentro faz o vaivém infinito. Separadas, uma não reinicia a outra.
 */
export function FormasAoFundo(): ReactElement {
  return (
    <div className="formas" aria-hidden="true">
      {FORMAS.map((f, i) => (
        <span
          key={i}
          className="forma"
          style={{
            ...vars({
              '--w': f.w, '--h': f.h, '--r': f.r,
              '--giro': f.giro, '--atraso': f.atraso, '--tom': f.tom,
              '--l': 'l' in f ? f.l : 'auto',
              '--t': 't' in f ? f.t : 'auto',
            }),
            ...('r_' in f ? { right: f.r_ } : null),
            ...('b' in f ? { bottom: f.b } : null),
          }}
        >
          <span className="forma__corpo" />
        </span>
      ))}
    </div>
  );
}

/** As manchas âmbar espalhadas pela cena, em deriva lenta. */
export function MalhaAmbar(): ReactElement {
  return <div className="hero__malha" aria-hidden="true" />;
}

/**
 * O véu: apaga tudo contra o topo e a base para o fundo nunca disputar a
 * leitura do texto nem cortar seco no fim da seção.
 */
export function Veu(): ReactElement {
  return <div className="hero__veu" aria-hidden="true" />;
}
