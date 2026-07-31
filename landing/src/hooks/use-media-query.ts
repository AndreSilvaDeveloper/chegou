import { useEffect, useState } from 'react';

/**
 * Uma media query como estado do React.
 *
 * Existe para os casos em que o JS precisa saber o que o CSS decidiu. Quando
 * só o CSS reage ao tamanho, ele resolve sozinho e este hook é desnecessário —
 * usá-lo por hábito duplicaria em JavaScript uma regra que já existe.
 */
export function useMediaQuery(consulta: string): boolean {
  const [combina, setCombina] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(consulta).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setCombina(mq.matches);
    aoMudar();
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, [consulta]);

  return combina;
}
