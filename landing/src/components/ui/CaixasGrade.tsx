'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { vars } from '@/lib/css';
import { useEmVista } from '@/hooks/use-em-vista';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useMovimentoReduzido } from '@/hooks/use-movimento-reduzido';
import { PacoteIso } from './PacoteIso';
import './CaixasGrade.css';

interface Grade {
  /** Colunas e linhas em tela larga. */
  largo: { c: number; l: number };
  /** Idem no celular. */
  estreito: { c: number; l: number };
}

/**
 * Poucas peças, de propósito. O formato é de quem usa: o campo se ajusta ao
 * espaço que vai ocupar, e um vão alto pede uma grade diferente de um vão
 * largo.
 *
 * O TAMANHO VEM DO COMPONENTE E VAI PARA O CSS, nunca o contrário: a conta usa
 * linha e coluna de cada peça, e se o CSS reflowasse a grade sozinho num
 * breakpoint, o JS continuaria calculando com a grade antiga e as peças
 * reagiriam nos lugares errados. Uma fonte só para os dois.
 */
const PADRAO: Grade = { largo: { c: 3, l: 4 }, estreito: { c: 3, l: 2 } };

/**
 * Em quantas células o efeito se espalha a partir do ponteiro.
 *
 * ANDA JUNTO COM O TAMANHO DA GRADE, e é fácil esquecer disso: o alcance é
 * medido em CÉLULAS, não em pixels. Ao reduzir a grade de 7x3 para 6x2, o
 * mesmo 2,2 passou a acender três quartos do campo de uma vez — a onda virou
 * um pulso geral.
 *
 * Com 1,35 a reação forte fica em torno de um quarto das peças, e como só há
 * duas linhas o resultado lê como uma faixa varrendo da esquerda para a
 * direita — que é o gesto certo para uma seção larga e baixa.
 */
const ALCANCE = 1.35;
/** Quanto a peça mais próxima sobe, em px. */
const SUBIDA = 16;
/** Quanto ela cresce, em fração. */
const CRESCE = 0.32;

/**
 * Um campo de encomendas que reagem à passagem do ponteiro.
 *
 * O DESENHO É O PACOTE DO HERO, em contorno isométrico — não um cubo sólido.
 * A referência usa peças 3D de seis faces girando; aqui a linguagem da página
 * já é o traço isométrico, e inclinar em 3D um desenho que JÁ está em
 * perspectiva daria duas perspectivas brigando no mesmo objeto.
 *
 * Então a reação mudou de natureza: em vez de tombar, a peça SOBE, cresce e
 * acende conforme o ponteiro chega perto. É a mesma ideia — um campo que
 * responde à proximidade — no vocabulário certo.
 *
 * Isso também barateia muito: cada célula virou um SVG de quatro traços, no
 * lugar de seis divs empilhadas em profundidade — 87% menos elementos.
 */
export function CaixasGrade({ grade = PADRAO }: { grade?: Grade } = {}): ReactElement | null {
  const palcoRef = useRef<HTMLDivElement>(null);
  const [refVista, emVista] = useEmVista<HTMLDivElement>({ limiar: 0 });
  const reduzido = useMovimentoReduzido();
  const estreito = useMediaQuery('(max-width: 767px)');
  const { c: COLUNAS, l: LINHAS } = estreito ? grade.estreito : grade.largo;

  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco || reduzido || !emVista) return;

    const pecas = Array.from(palco.querySelectorAll<HTMLElement>('.campo__peca'));
    /* Último valor escrito por peça. A maioria fica em repouso o tempo todo, e
       reescrever "repouso" a cada quadro é trabalho puro. */
    const ultimo = new Array<number>(pecas.length).fill(0);

    let alvo = { x: Math.random() * COLUNAS, y: Math.random() * LINHAS };
    let atual = { ...alvo };
    let mexendo = false;
    let ocioso = 0;
    let pedido = 0;

    function reagir(linha: number, coluna: number) {
      for (let i = 0; i < pecas.length; i++) {
        const p = pecas[i];
        const d = Math.hypot(Number(p.dataset.l) - linha, Number(p.dataset.c) - coluna);
        // Arredondado em centésimos: abaixo disso a diferença não é visível e
        // só serve para disparar escrita no DOM.
        const k = d <= ALCANCE ? Math.round((1 - d / ALCANCE) * 100) / 100 : 0;
        if (ultimo[i] === k) continue;
        // Chegar é rápido; voltar é lento. É o que dá peso à peça.
        p.style.transitionDuration = k > ultimo[i] ? '.3s' : '.7s';
        ultimo[i] = k;
        p.style.transform = k ? `translateY(${-SUBIDA * k}px) scale(${1 + CRESCE * k})` : '';
        p.style.opacity = String(0.3 + 0.65 * k);
      }
    }

    function quadro() {
      if (!mexendo) {
        // Sem ponteiro, um alvo vagueia sozinho pela grade.
        atual.x += (alvo.x - atual.x) * 0.02;
        atual.y += (alvo.y - atual.y) * 0.02;
        if (Math.hypot(alvo.x - atual.x, alvo.y - atual.y) < 0.15) {
          alvo = { x: Math.random() * COLUNAS, y: Math.random() * LINHAS };
        }
        reagir(atual.y, atual.x);
      }
      pedido = requestAnimationFrame(quadro);
    }

    function aoMover(e: PointerEvent) {
      mexendo = true;
      window.clearTimeout(ocioso);
      const r = palco!.getBoundingClientRect();
      const cx = ((e.clientX - r.left) / r.width) * COLUNAS;
      const cy = ((e.clientY - r.top) / r.height) * LINHAS;
      reagir(cy, cx);
      // Parado por um tempo, o passeio reassume de onde a pessoa deixou.
      ocioso = window.setTimeout(() => {
        atual = { x: cx, y: cy };
        mexendo = false;
      }, 2200);
    }

    function aoSair() {
      window.clearTimeout(ocioso);
      mexendo = false;
    }

    palco.addEventListener('pointermove', aoMover);
    palco.addEventListener('pointerleave', aoSair);
    pedido = requestAnimationFrame(quadro);

    return () => {
      palco.removeEventListener('pointermove', aoMover);
      palco.removeEventListener('pointerleave', aoSair);
      window.clearTimeout(ocioso);
      cancelAnimationFrame(pedido);
    };
  }, [reduzido, emVista, COLUNAS, LINHAS]);

  // Sem movimento a grade não entra: é decoração, seria só peso.
  if (reduzido) return null;

  return (
    <div className="campo" ref={refVista} aria-hidden="true">
      <div
        className="campo__palco"
        ref={palcoRef}
        style={vars({ '--cols': COLUNAS, '--rows': LINHAS })}
      >
        {Array.from({ length: LINHAS }, (_, l) =>
          Array.from({ length: COLUNAS }, (_, c) => (
            <div className="campo__peca" key={`${l}-${c}`} data-l={l} data-c={c}>
              <PacoteIso className="campo__desenho" traco={2.2} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}
