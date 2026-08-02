'use client';

import type { ReactElement } from 'react';
import { Icone } from '@/components/ui/Icone';
import { useTema } from '@/hooks/use-tema';

/** Alterna claro/escuro. O rótulo diz o que vai ACONTECER, não o estado atual. */
export function BotaoTema(): ReactElement {
  const { escuro, alternar } = useTema();

  return (
    <button
      className="icone-btn"
      type="button"
      onClick={alternar}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
    >
      <Icone nome={escuro ? 'sol' : 'lua'} tamanho={18} />
    </button>
  );
}
