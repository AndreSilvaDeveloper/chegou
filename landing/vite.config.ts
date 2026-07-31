import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// A landing é um site estático e independente do painel: nada de PWA, nada de
// service worker, nada de react-query. O que ela compartilha com o `web/` é a
// arquitetura (React + TS + Vite + alias `@/`) e os tokens do design system —
// não o bundle. Misturar as duas coisas faria o porteiro baixar o marketing
// junto com a ferramenta de trabalho.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174, // 5173 é do painel; rodar os dois juntos é comum em dev
    host: true,
  },
  build: {
    outDir: 'dist',
    // Uma página só: dividir em chunks só adicionaria ida e volta de rede.
    chunkSizeWarningLimit: 900,
  },
});
