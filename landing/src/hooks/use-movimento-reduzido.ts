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
  const [reduzido, setReduzido] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA);
    const aoMudar = () => setReduzido(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  return reduzido;
}
