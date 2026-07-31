import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// A ORDEM DESTES TRÊS IMPORTS É A ORDEM DO CSS NO BUNDLE.
//
// Import de módulo é avaliado na ordem em que aparece, e o CSS de cada
// componente entra junto com o componente que o importa. Então:
//
//   1. `styles/index.css` — tokens, reset e escala, ANTES de qualquer componente
//   2. `App`             — arrasta o CSS de toda a árvore
//   3. `styles/movimento.css` — desliga animações com `!important` e precisa
//                               vencer o CSS de componente, por isso vem por último
//
// Trocar a ordem faz o reset sobrescrever componente (caso 1) ou o
// `prefers-reduced-motion` deixar de valer (caso 3).
import './styles/index.css';
import App from './App';
import './styles/movimento.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
