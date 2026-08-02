'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

interface Opcoes {
  /** Depois de aparecer uma vez, para de observar. Para reveals. */
  umaVez?: boolean;
  margem?: string;
  limiar?: number;
}

/**
 * O elemento está na tela?
 *
 * É o hook mais reaproveitado da página, e de propósito: revelar seção, ligar
 * o canvas, soltar o separador, ligar o rAF da pilha — tudo isso é a mesma
 * pergunta. Concentrar num lugar evita quatro observadores escritos de quatro
 * jeitos ligeiramente diferentes.
 *
 * Nada aqui anima. Quem anima é quem consome a resposta — este hook só diz
 * "sim" ou "não", e é isso que o torna reutilizável.
 */
export function useEmVista<T extends Element>(
  { umaVez = false, margem = '0px', limiar = 0 }: Opcoes = {},
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const alvo = ref.current;

    /* FALHA SEGURA — não remover.
       Sem nó para observar, o certo é MOSTRAR. Quem depende deste hook para
       revelar (`Revelar`) parte de `opacity: 0`, então "não sei" tem de virar
       "apareça", nunca "fique escondido".

       O caso real: um componente que esquece de repassar o `ref` até o DOM.
       Antes isto retornava cedo e o conteúdo sumia da página em silêncio —
       aconteceu duas vezes. Agora o efeito só deixa de acontecer. */
    if (!alvo) {
      setVisivel(true);
      return;
    }

    // Sem suporte, mesma regra: melhor mostrar tudo que esconder conteúdo.
    if (!('IntersectionObserver' in window)) {
      setVisivel(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          if (umaVez) obs.unobserve(alvo);
        } else if (!umaVez) {
          setVisivel(false);
        }
      },
      { rootMargin: margem, threshold: limiar },
    );

    obs.observe(alvo);
    return () => obs.disconnect();
  }, [umaVez, margem, limiar]);

  return [ref, visivel];
}
