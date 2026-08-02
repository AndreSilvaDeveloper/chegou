'use client';

import { Fragment, useEffect, useMemo, useState, type ReactElement } from 'react';
import { cn, vars } from '@/lib/css';
import { useEmVista } from '@/hooks/use-em-vista';
import { useMovimentoReduzido } from '@/hooks/use-movimento-reduzido';
import './TituloFlutuante.css';

/**
 * O navegador resolve o progresso pelo scroll, sem listener nem rAF?
 *
 * É pergunta que SÓ o navegador responde — no build não existe `CSS`. Por isso
 * ela não pode ser constante de módulo nem entrar no primeiro render: o
 * servidor responderia `false` (`gatilho`) e o Chrome `true` (`scroll`), o
 * `data-modo` sairia diferente dos dois lados e a hidratação acusaria. Mesma
 * armadilha dos hooks de media query — ver `use-movimento-reduzido.ts`.
 *
 * Começa em `false`: o modo `gatilho` funciona em qualquer navegador, então o
 * primeiro quadro nunca fica sem animação; o efeito só troca para o caminho
 * mais barato onde ele existe.
 */
function useTemScrollTimeline(): boolean {
  const [tem, setTem] = useState(false);

  useEffect(() => {
    setTem(CSS.supports?.('animation-timeline: view()') ?? false);
  }, []);

  return tem;
}

/** Janela de cada letra e o quanto a largada escorrega da primeira à última. */
const INICIO = 8;
const CURSO = 19;
const ESCORREGA = 18;

/**
 * Título que sobe letra a letra conforme a seção entra na tela.
 *
 * Roda em `animation-timeline: view()` — a ScrollTimeline nativa, resolvida
 * fora da main thread. Não há listener de scroll nem medição por quadro, que é
 * o custo do equivalente feito em JS.
 *
 * O escalonamento NÃO é tempo: cada letra recebe uma janela de rolagem própria
 * (`--ini`/`--fim`). Com scroll-linked não existe "atraso"; existe posição.
 *
 * Onde a ScrollTimeline não existe, cai para o mesmo desenho disparado uma vez
 * ao entrar na tela.
 */
export function TituloFlutuante({ children }: { children: string }): ReactElement {
  const reduzido = useMovimentoReduzido();
  const temScrollTimeline = useTemScrollTimeline();
  const [ref, visivel] = useEmVista<HTMLHeadingElement>({
    umaVez: true,
    margem: '0px 0px -12% 0px',
    limiar: 0.15,
  });

  const palavras = useMemo(() => {
    const texto = children.trim().replace(/\s+/g, ' ');
    const total = texto.replace(/ /g, '').length;
    let n = 0;
    return texto.split(' ').map((palavra) =>
      [...palavra].map((letra) => {
        const f = total > 1 ? n++ / (total - 1) : 0;
        const ini = INICIO + f * ESCORREGA;
        return { letra, ini, fim: ini + CURSO, atraso: Math.round(f * 320) };
      }),
    );
  }, [children]);

  // Sem movimento, nada de dividir o texto: o título fica como está.
  if (reduzido) return <h2 className="t-titulo">{children}</h2>;

  const modo = temScrollTimeline ? 'scroll' : 'gatilho';

  return (
    <h2
      ref={ref}
      className={cn('t-titulo', 'flutua', modo === 'gatilho' && visivel && 'visivel')}
      data-modo={modo}
      /* O leitor de tela anuncia a frase, não letra por letra. */
      aria-label={children}
    >
      {palavras.map((letras, p) => (
        <Fragment key={p}>
          <span className="palavra">
            {letras.map(({ letra, ini, fim, atraso }, i) => (
              <span
                className="char"
                key={i}
                style={vars({
                  '--ini': `${ini.toFixed(2)}%`,
                  '--fim': `${fim.toFixed(2)}%`,
                  '--atraso': `${atraso}ms`,
                })}
              >
                {letra}
              </span>
            ))}
          </span>
          {/* Espaço FORA da palavra: é o único ponto onde a linha pode quebrar,
              já que `.palavra` é `white-space: nowrap`. */}
          {p < palavras.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </h2>
  );
}
