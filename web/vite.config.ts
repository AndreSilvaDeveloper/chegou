import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'node:fs';

// A versão do app mora em web/package.json e entra no bundle como __APP_VERSION__.
// É ela que aparece na sidebar e que diz ao usuário qual build ele está rodando.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  // O painel vive sob `/app/` — a raiz do domínio é da landing page.
  //
  // Isto faz o build referenciar `/app/assets/...` em vez de `/assets/...`, e é
  // o par obrigatório do `basename="/app"` do react-router em `main.tsx`: um sem
  // o outro quebra tudo — assets em 404, ou links apontando para fora do painel.
  //
  // **Não afeta `fetch`.** O `client.ts` continua chamando `/api/...` absoluto a
  // partir da raiz, e é assim que ele cai no bloco `/api/` do nginx. Se um dia
  // alguém "corrigir" isso para caminho relativo, as chamadas viram
  // `/app/api/...` e o painel inteiro cai de uma vez.
  base: '/app/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' e não 'autoUpdate': quem decide a HORA de recarregar é o app
      // (`useAtualizacaoAutomatica`), para não puxar o tapete de quem está no
      // meio de um cadastro. A atualização continua automática — só espera um
      // momento seguro. Ver web/src/hooks/use-atualizacao.ts.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Chegou — Central de Portaria',
        short_name: 'Chegou',
        description: 'Gestão de encomendas e condomínio com notificação via WhatsApp',
        // Barra do sistema com o app instalado: status bar no Android, barra de
        // título na janela do desktop. É o âmbar do tema, para ela virar
        // continuação da faixa do topo em vez de uma listra de outra cor.
        // Mantenha igual às metas `theme-color` do index.html.
        theme_color: '#FFC72C',
        // Tela de abertura (splash): fundo + ícone centralizado, e ela NÃO
        // acompanha claro/escuro. Fica no tom da folha clara, não no âmbar: o
        // ícone já é âmbar e sumiria dentro de um fundo da mesma cor.
        background_color: '#F3F0EA',
        display: 'standalone',
        orientation: 'portrait',
        // **O escopo é o motivo de existir o prefixo `/app`.** O escopo de um
        // service worker é um prefixo de caminho: com o painel na raiz, o único
        // possível seria `/` — e aí o SW do painel passaria a controlar e
        // cachear a **landing page**. Publicar uma mudança no site de marketing
        // e ela não aparecer para quem já abriu o painel é bug que só se
        // manifesta depois, com cliente na frente.
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fora de `/app/` não é painel: é a landing. Sem esta negativa, o
        // fallback de navegação do SW responderia o `index.html` do painel para
        // uma URL do site de marketing.
        navigateFallbackDenylist: [/^\/api/, /^\/(?!app\/)/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // 0.0.0.0 para ser acessível quando roda dentro do Docker
    host: true,
    // Em dev no Docker (bind mount), o watcher precisa de polling p/ o HMR funcionar
    watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true } : undefined,
    proxy: {
      // No Docker aponta pro serviço `api`; no host, localhost:3000
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
});
