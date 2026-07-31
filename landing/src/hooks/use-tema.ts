import { useCallback, useEffect, useState } from 'react';

export type Tema = 'light' | 'dark';

const CHAVE = 'condoavisa.tema';
const ESCURO = '(prefers-color-scheme: dark)';

function marcado(): Tema | null {
  const v = document.documentElement.getAttribute('data-theme');
  return v === 'dark' || v === 'light' ? v : null;
}

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    // Navegador sem storage (aba anônima restrita): segue a preferência do
    // sistema, que é o comportamento correto para quem nunca escolheu.
    return null;
  }
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
  const [escuro, setEscuro] = useState(
    () => (guardado() ?? (window.matchMedia(ESCURO).matches ? 'dark' : 'light')) === 'dark',
  );

  // Aplica a escolha guardada antes da primeira pintura útil.
  useEffect(() => {
    const g = guardado();
    if (g) document.documentElement.setAttribute('data-theme', g);
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
      localStorage.setItem(CHAVE, proximo);
    } catch {
      /* sem storage: vale só nesta visita */
    }
    setEscuro(proximo === 'dark');
  }, [escuro]);

  return { escuro, alternar };
}
