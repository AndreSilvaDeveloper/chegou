import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'node:fs';

// A versão do app mora em web/package.json e entra no bundle como __APP_VERSION__.
// É ela que aparece na sidebar e que diz ao usuário qual build ele está rodando.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
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
        theme_color: '#18181b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
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
