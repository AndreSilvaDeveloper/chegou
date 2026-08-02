'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAVE_TEMA, type Tema } from '@/lib/tema';

export type { Tema };

const ESCURO = '(prefers-color-scheme: dark)';

function marcado(): Tema | null {
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'dark' || v === 'light' ? v : null;
}

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    // Navegador sem storage (aba anônima restrita): segue a preferência do
    // sistema, que é o comportamento correto para quem nunca escolheu.
    return null;
  }
}

/** O tema que vale AGORA, lido do próprio documento. Só faz sentido no cliente. */
function vigente(): Tema {
  return marcado() ?? guardado() ?? (window.matchMedia(ESCURO).matches ? 'dark' : 'light');
}

/**
 * Tema claro/escuro.
 *
 * A escolha da pessoa vence a preferência do sistema, e vence NOS DOIS
 * SENTIDOS — daí o atributo `data-theme` no `<html>`, que os tokens usam para
 * sobrescrever o `@media (prefers-color-scheme)`. Enquanto ninguém escolher,
 * o atributo não existe e o sistema manda.
 *
 * `escuro` é derivado a cada troca em vez de guardado como fonte da verdade:
 * ele depende de duas origens (a escolha e o sistema) e duplicar isso em
 * estado é como as duas discordam.
 */
export function useTema() {
  /*
   * COMEÇA EM `false` DE PROPÓSITO — não é um palpite, é o único valor que o
   * servidor pode produzir.
   *
   * O HTML nasce no build, onde não existe `window` nem a escolha de ninguém.
   * Ler o tema aqui quebra o build ("window is not defined") e, guardado num
   * `useState` que só o cliente sabe responder, viraria erro de hidratação.
   *
   * O que NÃO espera pela hidratação é a COR DA PÁGINA: o `SCRIPT_TEMA` do
   * layout já aplicou `data-theme` antes da primeira pintura. O que se acerta
   * no efeito abaixo é só o ícone do botão.
   */
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    setEscuro(vigente() === 'dark');
  }, []);

  // Sem escolha explícita, acompanha o sistema.
  useEffect(() => {
    const mq = window.matchMedia(ESCURO);
    const aoMudar = () => {
      if (!marcado()) setEscuro(mq.matches);
    };
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const alternar = useCallback(() => {
    const proximo: Tema = escuro ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', proximo);
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      /* sem storage: vale só nesta visita */
    }
    setEscuro(proximo === 'dark');
  }, [escuro]);

  return { escuro, alternar };
}
