'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { cn } from '@/lib/css';
import { NAVEGACAO } from '@/lib/conteudo';
import './Menu.css';

/**
 * O menu de pílulas do desktop.
 *
 * No hover, um círculo âmbar sobe do rodapé da pílula e a preenche enquanto o
 * rótulo rola para cima e um eco sobe no lugar. Tudo em CSS: o círculo é
 * dimensionado em PORCENTAGEM da pílula, então cada uma calcula o próprio raio
 * sem ninguém medir nada — e o navegador reage a resize e troca de fonte
 * sozinho.
 *
 * O eco é `aria-hidden`: para o leitor de tela é um link com um texto só.
 */
export function MenuPilulas({ ativa }: { ativa: string | null }): ReactElement {
  return (
    <nav className="menu" aria-label="Seções">
      {NAVEGACAO.map(({ id, rotulo }) => (
        <a
          key={id}
          className="pilula"
          href={`#${id}`}
          aria-current={ativa === id ? 'location' : undefined}
        >
          <span className="pilula__circulo" aria-hidden="true" />
          <span className="pilula__pilha">
            <span className="pilula__rotulo">{rotulo}</span>
            <span className="pilula__eco" aria-hidden="true">
              {rotulo}
            </span>
          </span>
        </a>
      ))}
    </nav>
  );
}

interface PropsMovel {
  aberto: boolean;
  aoFechar: () => void;
  ativa: string | null;
}

/**
 * O menu do celular.
 *
 * Abre e fecha por `@starting-style` + `transition-behavior: allow-discrete` —
 * o caminho nativo para animar algo que entra e sai do `display`, sem
 * `visibility` nem timeout.
 *
 * Em toque não existe hover, então as pílulas daqui ficam só com a forma:
 * animar um estado que ninguém aciona é peso morto.
 */
export function MenuMovel({ aberto, aoFechar, ativa }: PropsMovel): ReactElement {
  const ref = useRef<HTMLElement>(null);

  // Fecha pelos três caminhos que a pessoa espera: Esc, toque fora, escolher.
  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (!ref.current?.contains(alvo) && !alvo.closest('.hamburguer')) aoFechar();
    };

    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('click', aoClicar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('click', aoClicar);
    };
  }, [aberto, aoFechar]);

  return (
    <nav
      ref={ref}
      className="menu-movel"
      id="menu-movel"
      data-aberto={aberto ? 'sim' : undefined}
      aria-label="Seções (celular)"
    >
      {NAVEGACAO.map(({ id, rotulo }) => (
        <a
          key={id}
          className={cn('pilula', 'pilula--movel')}
          href={`#${id}`}
          onClick={aoFechar}
          aria-current={ativa === id ? 'location' : undefined}
        >
          {rotulo}
        </a>
      ))}
    </nav>
  );
}

/** O botão que vira X. As duas barras giram ±45° e se encontram no meio. */
export function Hamburguer({
  aberto,
  aoAlternar,
}: {
  aberto: boolean;
  aoAlternar: () => void;
}): ReactElement {
  return (
    <button
      className="hamburguer"
      type="button"
      onClick={aoAlternar}
      aria-expanded={aberto}
      aria-controls="menu-movel"
      aria-label={aberto ? 'Fechar o menu de seções' : 'Abrir o menu de seções'}
    >
      <span className="hamburguer__traco" />
      <span className="hamburguer__traco" />
    </button>
  );
}
