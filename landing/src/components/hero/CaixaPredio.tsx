import type { ReactElement } from 'react';
import './CaixaPredio.css';

/** As três faces de um pacote pequeno, centradas na origem do grupo. */
function Pacote({ escala = 1 }: { escala?: number }): ReactElement {
  const corpo = (
    <>
      <polygon className="cx-esq cx-traco" points="-26,0 0,14 0,44 -26,30" />
      <polygon className="cx-dir cx-traco" points="26,0 0,14 0,44 26,30" />
      <polygon className="cx-topo cx-traco" points="-26,0 0,-14 26,0 0,14" />
      <polygon className="cx-fita cx-traco" points="-17.2,-4.8 8.8,9.2 17.2,4.8 -8.8,-9.2" />
    </>
  );
  return escala === 1 ? corpo : <g transform={`scale(${escala})`}>{corpo}</g>;
}

/**
 * A CAIXA-PRÉDIO — a tese da página.
 *
 * A marca é uma caixa de papelão cuja face esquerda é a fachada de um prédio:
 * a caixa É o condomínio. A animação encena o produto inteiro — ela abre, as
 * encomendas entram, ela fecha, o código nasce na etiqueta e as janelas
 * acendem.
 *
 * A ORDEM DE PINTURA É A PROFUNDIDADE, e é o que faz o pacote entrar de
 * verdade: interior → pacotes recortados pela boca → corpo → abas por cima.
 *
 * As abas dobram por reflexão sobre o próprio vinco: alinha-se o vinco à
 * horizontal (rotate ∓29°), inverte-se em Y e desfaz-se a rotação. Todo o
 * tempo está em PORCENTAGEM de um ciclo só, então nada sai de sincronia.
 */
export function CaixaPredio(): ReactElement {
  return (
    <svg className="cena" viewBox="0 -30 400 375" role="img" aria-labelledby="cena-tit">
      <title id="cena-tit">
        A caixa do condomínio se abre, três encomendas entram, a caixa fecha e o código de
        retirada 4821 é emitido na etiqueta.
      </title>

      <defs>
        {/* A boca da caixa: tudo acima da aresta frontal. É o que faz o pacote
            sumir ao afundar, em vez de ficar boiando por cima. */}
        <clipPath id="boca">
          <polygon points="0,-30 400,-30 400,150 292,150 200,201 108,150 0,150" />
        </clipPath>
      </defs>

      {/* o aviso saindo, depois que a caixa fecha */}
      <ellipse className="cx-anel" cx={200} cy={150} rx={104} ry={58} />
      <ellipse className="cx-anel cx-anel--2" cx={200} cy={150} rx={104} ry={58} />

      {/* o fundo da caixa, visto de cima */}
      <polygon className="cx-dentro" points="108,150 200,99 292,150 200,201" />

      <g clipPath="url(#boca)">
        <g transform="translate(200,150)">
          <g className="cx-pacote--1">
            <Pacote />
          </g>
        </g>
        <g transform="translate(200,150)">
          <g className="cx-pacote--2">
            <Pacote escala={0.82} />
          </g>
        </g>
        <g transform="translate(200,150)">
          <g className="cx-pacote--3">
            <Pacote escala={0.92} />
          </g>
        </g>
      </g>

      {/* face direita: onde mora a etiqueta com o código */}
      <polygon className="cx-dir cx-traco" points="292,150 200,201 200,313 292,262" />
      {/* face esquerda: a fachada do prédio — a ideia inteira da marca */}
      <polygon className="cx-esq cx-traco" points="108,150 200,201 200,313 108,262" />

      <g className="cx-janela">
        <polygon points="120,178.6 135.6,187.3 135.6,207.3 120,198.6" />
        <polygon points="145.7,192.9 161.4,201.6 161.4,221.6 145.7,212.9" />
        <polygon points="171.5,207.2 187.1,215.9 187.1,235.9 171.5,227.2" />
        <polygon points="120,210.6 135.6,219.3 135.6,239.3 120,230.6" />
        <polygon points="145.7,224.9 161.4,233.6 161.4,253.6 145.7,244.9" />
        <polygon points="171.5,239.2 187.1,247.9 187.1,267.9 171.5,259.2" />
        <polygon points="135.6,255.3 159.5,268.6 159.5,290.6 135.6,277.3" />
      </g>

      {/* as mesmas janelas, acesas: o prédio soube que a encomenda chegou */}
      <g className="cx-acesa">
        <polygon points="120,178.6 135.6,187.3 135.6,207.3 120,198.6" />
        <polygon points="145.7,192.9 161.4,201.6 161.4,221.6 145.7,212.9" />
        <polygon points="171.5,207.2 187.1,215.9 187.1,235.9 171.5,227.2" />
        <polygon points="120,210.6 135.6,219.3 135.6,239.3 120,230.6" />
        <polygon points="145.7,224.9 161.4,233.6 161.4,253.6 145.7,244.9" />
        <polygon points="171.5,239.2 187.1,247.9 187.1,267.9 171.5,259.2" />
      </g>

      {/* O skewY(-29°) põe o retângulo e o texto no mesmo plano isométrico da
          face — sem isso, o código flutuaria sobre a caixa em vez de estar
          colado nela. */}
      <g transform="translate(200,201) skewY(-29)">
        <g className="cx-selo">
          <rect className="cx-etiqueta" x={14} y={26} width={66} height={36} rx={5} />
          <text className="cx-digito" x={47} y={51} textAnchor="middle">
            4821
          </text>
        </g>
      </g>

      {/* as abas: as de trás abrem mais e fecham antes */}
      <polygon className="cx-topo cx-traco cx-aba cx-aba--te" points="108,150 200,99 200,150" />
      <polygon className="cx-topo cx-traco cx-aba cx-aba--td" points="200,99 292,150 200,150" />
      <polygon className="cx-topo cx-traco cx-aba cx-aba--fe" points="108,150 200,201 200,150" />
      <polygon className="cx-topo cx-traco cx-aba cx-aba--fd" points="200,201 292,150 200,150" />
    </svg>
  );
}
