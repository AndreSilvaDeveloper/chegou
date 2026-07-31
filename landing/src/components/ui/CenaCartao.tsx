import type { ReactElement } from 'react';
import './CenaCartao.css';

export type Cena = 'pronto' | 'linha' | 'leitura' | 'ritmo' | 'dentro';

/**
 * A cena da frente de cada cartão que vira.
 *
 * Cinco desenhos diferentes, um por argumento — no lugar do mesmo halo
 * pulsante repetido cinco vezes. Um ornamento igual em todos os cartões não
 * diz nada; aqui cada cena É o argumento, encenado.
 *
 * Mesma linguagem da caixa-prédio do hero: contorno, isometria onde couber, e
 * o âmbar reservado ao que importa em cada quadro. Só `transform` e `opacity`
 * animam, como no resto da página.
 */
export function CenaCartao({ cena }: { cena: Cena }): ReactElement {
  return (
    <div className="cena-cartao" aria-hidden="true">
      <svg viewBox="0 0 200 120" className={`cc cc--${cena}`}>
        {CENAS[cena]}
      </svg>
    </div>
  );
}

const CENAS: Record<Cena, ReactElement> = {
  /* ZERO ADESÃO — o celular já chega pronto: a mensagem entra, o check vem.
     Não há passo de instalar, e é isso que o desenho não mostra. */
  pronto: (
    <>
      <rect className="cc-traco" x="72" y="12" width="56" height="96" rx="9" />
      <line className="cc-traco cc-fino" x1="92" y1="22" x2="108" y2="22" />
      <g className="cc-balao">
        <rect className="cc-cheio" x="82" y="44" width="36" height="22" rx="6" />
        <path className="cc-cheio" d="M88 66 L88 74 L96 66 Z" />
      </g>
      <path className="cc-check" d="M90 55 l5 5 10 -11" />
    </>
  ),

  /* O NÚMERO É DO CONDOMÍNIO — o balão sobe do próprio prédio, não de fora.
     Por isso a caixa-prédio aparece aqui: quem fala é o condomínio. */
  linha: (
    <>
      <g className="cc-traco" transform="translate(100 86) scale(.42)">
        <polygon points="-46,-26 0,-51 46,-26 0,-1" />
        <polygon points="-46,-26 0,-1 0,55 -46,30" />
        <polygon points="46,-26 0,-1 0,55 46,30" />
      </g>
      {[0, 1, 2].map((i) => (
        <g className="cc-sobe" key={i} style={{ animationDelay: `${i * 1.1}s` }}>
          <rect className="cc-cheio" x="76" y="18" width="48" height="26" rx="8" />
          <path className="cc-cheio" d="M84 44 L84 52 L94 44 Z" />
          <line className="cc-vinco" x1="84" y1="27" x2="112" y2="27" />
          <line className="cc-vinco" x1="84" y1="35" x2="102" y2="35" />
        </g>
      ))}
    </>
  ),

  /* A ETIQUETA SE LÊ SOZINHA — a barra varre e os campos acendem na passagem.
     A ordem importa: primeiro a luz passa, depois o campo fica preenchido. */
  leitura: (
    <>
      <rect className="cc-traco" x="46" y="16" width="108" height="88" rx="7" />
      {/* Duas camadas: o campo apagado embaixo, o aceso por cima. Só a
          opacidade do de cima anima — animar a COR do traço obrigaria o
          navegador a repintar, e é a mesma solução das janelas do hero. */}
      {[34, 50, 66, 82].map((y, i) => (
        <line className="cc-campo" key={y} x1="60" y1={y} x2={i % 2 ? 128 : 140} y2={y} />
      ))}
      {[34, 50, 66, 82].map((y, i) => (
        <line
          className="cc-campo cc-campo--aceso"
          key={`a${y}`}
          x1="60"
          y1={y}
          x2={i % 2 ? 128 : 140}
          y2={y}
          style={{ animationDelay: `${i * 0.42}s` }}
        />
      ))}
      <rect className="cc-varredura" x="46" y="14" width="108" height="4" rx="2" />
    </>
  ),

  /* O ENVIO TEM RITMO — as mensagens partem uma a uma, espaçadas.
     O trilho pontilhado é a cadência; nenhuma sai junto com a outra. */
  ritmo: (
    <>
      <line className="cc-trilho" x1="24" y1="60" x2="176" y2="60" />
      <circle className="cc-traco" cx="24" cy="60" r="9" />
      <circle className="cc-traco cc-fino" cx="176" cy="60" r="6" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          className="cc-parte"
          key={i}
          x="-8"
          y="54"
          width="14"
          height="12"
          rx="3"
          style={{ animationDelay: `${i * 0.9}s` }}
        />
      ))}
    </>
  ),

  /* OS DADOS FICAM NO SERVIDOR — os pontos giram DENTRO do limite tracejado.
     Nenhum atravessa a borda: é o desenho inteiro do argumento. */
  dentro: (
    <>
      <rect className="cc-limite" x="40" y="18" width="120" height="84" rx="12" />
      <g className="cc-orbita">
        <circle className="cc-cheio" cx="100" cy="36" r="5" />
      </g>
      <g className="cc-orbita cc-orbita--2">
        <circle className="cc-cheio" cx="100" cy="42" r="4" />
      </g>
      <g className="cc-orbita cc-orbita--3">
        <circle className="cc-cheio" cx="100" cy="30" r="3" />
      </g>
      <path className="cc-nucleo" d="M92 60 h16 M100 52 v16" />
    </>
  ),
};
