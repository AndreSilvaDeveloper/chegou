'use client';

import { useEffect, useState } from 'react';

/**
 * Qual seção está sendo lida.
 *
 * A margem negativa reduz a área de observação a uma FAIXA FINA no meio da
 * tela: só uma seção a cruza por vez, então não há disputa sobre quem é a
 * atual — que é justamente onde o scrollspy escrito por posição de scroll
 * costuma piscar entre dois itens na fronteira.
 */
export function useSecaoAtiva(ids: readonly string[]): string | null {
  const [ativa, setAtiva] = useState<string | null>(null);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;

    const alvos = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (!alvos.length) return;

    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) if (e.isIntersecting) setAtiva(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);

  return ativa;
}
