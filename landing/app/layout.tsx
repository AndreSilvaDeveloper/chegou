import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Poppins } from 'next/font/google';
import type { ReactNode } from 'react';
import { DESCRICAO, TERMOS, TITULO, URL_SITE, dadosEstruturados } from '@/lib/site';
import { MARCA } from '@/lib/conteudo';
import { SCRIPT_TEMA } from '@/lib/tema';

// A ORDEM DESTES IMPORTS É A ORDEM DO CSS NO BUNDLE.
//
//   1. `styles/index.css` — tokens, reset e escala, ANTES de qualquer componente
//   2. o CSS de componente entra junto com cada componente que o importa
//   3. `styles/movimento.css` — desliga animações com `!important` e precisa
//      vencer o CSS de componente, por isso é o último aqui
//
// Era a mesma regra no `main.tsx` do Vite; mudou só o arquivo onde ela mora.
import '@/styles/index.css';
import '@/styles/movimento.css';

/**
 * As fontes são **auto-hospedadas** pelo `next/font`, não buscadas no Google a
 * cada visita. Duas consequências que a landing existe para ganhar: some a ida
 * e volta a `fonts.googleapis.com` (bloqueante no caminho crítico), e o
 * `size-adjust` gerado elimina o pulo de layout quando a fonte troca — que é
 * metade de um CLS ruim no PageSpeed.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--fonte-titulo',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fonte-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // Base para toda URL relativa daqui para baixo (canonical, OG, sitemap).
  metadataBase: new URL(URL_SITE),
  title: {
    default: TITULO,
    // Uma página só hoje; o template já deixa a próxima pronta.
    template: `%s — ${MARCA.completo}`,
  },
  description: DESCRICAO,
  keywords: [...TERMOS],
  applicationName: MARCA.completo,
  authors: [{ name: MARCA.completo }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: MARCA.completo,
    title: TITULO,
    description:
      'Portaria sem caderno, morador sem aplicativo. Notificação no WhatsApp do ' +
      'próprio condomínio, com código de retirada.',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRICAO,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBF9F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0A' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning`: o SCRIPT_TEMA escreve `data-theme` no <html>
    // antes do React hidratar. Sem isto, o React reclamaria de um atributo que
    // não estava no HTML do build — reclamação correta, causa deliberada.
    <html
      lang="pt-BR"
      className={`${poppins.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema escolhido ANTES da primeira pintura. Ver lib/tema.ts:
            é o que evita o flash de cor errada para quem escolheu o tema
            contrário ao do sistema. Precisa vir antes do CSS pesar na tela. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {/* Structured data: é por aqui que buscador e agente de IA entendem o
            que o produto é, quanto custa e o que já foi respondido. Sai de
            `conteudo.ts`, então revisar a copy revisa o dado estruturado. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(dadosEstruturados()) }}
        />
        {/* Sem JS, `.reveal` ficaria em `opacity: 0` para sempre — o texto está
            no HTML, mas invisível para quem renderiza a página sem executar
            script. Uma linha resolve, e ela só existe quando o JS não roda. */}
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
