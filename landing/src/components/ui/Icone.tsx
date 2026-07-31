import type { ReactElement, SVGProps } from 'react';

/**
 * Os ícones da página, desenhados uma vez.
 *
 * São traçados do Lucide, que é a única biblioteca de ícones do projeto (regra
 * do design system). Ficam inline em vez de virem do pacote React porque a
 * landing usa vinte ícones e não vale carregar a biblioteca inteira para isso —
 * mas o desenho é o mesmo, então a página e o painel nunca divergem.
 *
 * Ao acrescentar um: copie o traçado do Lucide, não desenhe à mão.
 */
const TRACOS = {
  relogio: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  mensagem: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  etiqueta: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 8h8" /><path d="M7 12h10" /><path d="M7 16h6" />
    </>
  ),
  codigo: (
    <><path d="M4 9h16" /><path d="M4 15h16" /><path d="M10 3 8 21" /><path d="M16 3l-2 18" /></>
  ),
  escudo: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  pessoas: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  duvida: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
    </>
  ),
  alerta: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </>
  ),
  celular: <><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></>,
  cadeado: (
    <><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
  ),
  capacete: (
    <>
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" />
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
      <path d="M4 15v-3a6 6 0 0 1 6-6" /><path d="M14 6a6 6 0 0 1 6 6v3" />
    </>
  ),
  predio: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" />
    </>
  ),
  pasta: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  seta: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  virar: (
    <>
      <path d="m2 9 3-3 3 3" /><path d="M13 18H7a2 2 0 0 1-2-2V6" />
      <path d="m22 15-3 3-3-3" /><path d="M11 6h6a2 2 0 0 1 2 2v10" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  lua: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  ajuste: (
    <>
      <path d="M12 2v4" /><path d="m6.8 6.8-2.9-2.9" /><path d="M2 12h4" />
      <circle cx="12" cy="12" r="4" />
      <path d="M18 12h4" /><path d="m17.2 6.8 2.9-2.9" /><path d="M12 18v4" />
    </>
  ),
} as const;

export type NomeIcone = keyof typeof TRACOS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  nome: NomeIcone;
  tamanho?: number;
}

export function Icone({ nome, tamanho = 20, ...resto }: Props): ReactElement {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {TRACOS[nome]}
    </svg>
  );
}
