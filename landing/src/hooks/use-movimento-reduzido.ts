'use client';

import { useEffect, useState } from 'react';

const CONSULTA = '(prefers-reduced-motion: reduce)';

/**
 * A pessoa pediu menos movimento no sistema operacional?
 *
 * O CSS já respeita isso sozinho (`styles/movimento.css`). Este hook existe
 * para o que o CSS não alcança: não montar canvas, não dividir texto em
 * letras, não ligar `requestAnimationFrame`. Desligar a animação depois de
 * já ter pago por ela seria só metade da cortesia.
 */
export function useMovimentoReduzido(): boolean {
  /*
   * COMEÇA EM `false` DE PROPÓSITO — é o único valor que o servidor produz.
   *
   * O que estava aqui antes era `typeof window !== 'undefined' && matchMedia(…)`,
   * que parece defensivo e é o contrário: o guard evita o "window is not
   * defined" no build, mas faz o PRIMEIRO render do cliente devolver o valor
   * real enquanto o HTML do servidor foi gerado com `false`. Para quem tem a
   * preferência ligada, os dois discordam e a hidratação falha inteira
   * (React #418) — o React descarta o HTML do servidor e regenera a árvore.
   *
   * É a regra 3 do CLAUDE.md desta pasta: o estado inicial tem de ser o mesmo
   * que o servidor produziria. Ler o navegador é trabalho do efeito.
   */
  const [reduzido, setReduzido] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const aoMudar = () => setReduzido(mq.matches);
    // A leitura inicial mora AQUI, não no `useState`. Sem esta linha o hook
    // ficaria em `false` até a preferência mudar — que é o oposto do objetivo.
    aoMudar();
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  return reduzido;
}
