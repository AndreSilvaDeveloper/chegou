'use client';

import { useEffect, useState } from 'react';

/**
 * Uma media query como estado do React.
 *
 * Existe para os casos em que o JS precisa saber o que o CSS decidiu. Quando
 * só o CSS reage ao tamanho, ele resolve sozinho e este hook é desnecessário —
 * usá-lo por hábito duplicaria em JavaScript uma regra que já existe.
 */
export function useMediaQuery(consulta: string): boolean {
  /*
   * COMEÇA EM `false` — o mesmo que o servidor produz. Ver a explicação longa
   * em `use-movimento-reduzido.ts`: ler `matchMedia` no inicializador do
   * `useState` faz o primeiro render do cliente divergir do HTML do servidor e
   * quebra a hidratação (React #418). O `aoMudar()` do efeito abaixo já traz o
   * valor real logo depois.
   */
  const [combina, setCombina] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setCombina(mq.matches);
    aoMudar();
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [consulta]);

  return combina;
}
