import type { ReactElement } from 'react';
import './CenaLeitura.css';

export type CenaNumero = 'cronometro' | 'vazio' | 'codigo' | 'unica';

/**
 * O mostrador que acompanha cada leitura do painel.
 *
 * Um instrumento tem duas partes: a face e o número. O número já existia; isto
 * é a face — pequena, ao lado do valor, encenando a grandeza que ele mede.
 *
 * São de propósito MENORES e mais simples que as cenas dos cartões que viram:
 * lá a cena é o assunto do quadro e tem 22rem para ocupar; aqui ela divide a
 * linha com o número e serve a ele.
 *
 * TODAS AS QUATRO OCUPAM A MESMA FAIXA VERTICAL, centrada em y=28 (o meio do
 * viewBox). Isso não é acaso: o contêiner alinha as CAIXAS, não os desenhos —
 * se cada arte se acomodasse onde desse, elas apareceriam em alturas
 * diferentes ao lado dos números, ainda que as caixas estivessem alinhadas.
 */
export function CenaLeitura({ cena }: { cena: CenaNumero }): ReactElement {
  return (
    <span className="cena-leitura" aria-hidden="true">
      <svg viewBox="0 0 56 56" className={`cl cl--${cena}`}>
        {CENAS[cena]}
      </svg>
    </span>
  );
}

const CENAS: Record<CenaNumero, ReactElement> = {
  /* 20s — o cronômetro. O ponteiro dá a volta; a coroa fica parada. */
  cronometro: (
    /* A arte fica 1,5 acima do meio do viewBox; o translate a recentra. */
    <g transform="translate(0 1.5)">
      <rect className="cl-traco" x="23" y="3" width="10" height="5" rx="2" />
      <line className="cl-traco" x1="28" y1="8" x2="28" y2="13" />
      <circle className="cl-traco" cx="28" cy="33" r="17" />
      <g className="cl-ponteiro">
        <line x1="28" y1="33" x2="28" y2="21" />
      </g>
      <circle className="cl-centro" cx="28" cy="33" r="2.5" />
    </g>
  ),

  /* 0 — o celular que fica vazio. A seta desce e se desfaz ANTES de entrar:
     é a instalação que não acontece. O retângulo tracejado nunca preenche. */
  vazio: (
    <g transform="translate(0 1.5)">
      <g className="cl-seta">
        <line className="cl-traco" x1="28" y1="1" x2="28" y2="9" />
        <path className="cl-traco" d="M24 6 l4 4 l4 -4" />
      </g>
      <rect className="cl-traco" x="17" y="14" width="22" height="38" rx="4" />
      <rect className="cl-vago" x="21" y="22" width="14" height="16" rx="2" />
    </g>
  ),

  /* 4 — os quatro dígitos do código, acendendo um a um. É a única cena que
     mostra literalmente o que o número conta. */
  codigo: (
    /* Casas altas, não quadradinhas: com 16 de altura esta cena media um
       terço das outras e parecia flutuar ao lado do número. */
    <>
      {[3, 16, 29, 42].map((x, i) => (
        <g key={x}>
          <rect className="cl-traco" x={x} y="9" width="11" height="38" rx="3" />
          <rect
            className="cl-aceso"
            x={x}
            y="9"
            width="11"
            height="38"
            rx="3"
            style={{ animationDelay: `${i * 0.35}s` }}
          />
        </g>
      ))}
    </>
  ),

  /* 1 — uma linha só, saindo do prédio. O nó pulsa; não há segundo caminho. */
  unica: (
    <>
      <g className="cl-pulso">
        <circle className="cl-halo" cx="28" cy="12" r="9" />
      </g>
      <circle className="cl-no" cx="28" cy="12" r="4.5" />
      <line className="cl-traco" x1="28" y1="17" x2="28" y2="32" />
      <rect className="cl-traco" x="19" y="32" width="18" height="21" rx="2" />
      <line className="cl-traco cl-fino" x1="23" y1="38" x2="27" y2="38" />
      <line className="cl-traco cl-fino" x1="30" y1="38" x2="34" y2="38" />
      <line className="cl-traco cl-fino" x1="23" y1="44" x2="27" y2="44" />
    </>
  ),
};
