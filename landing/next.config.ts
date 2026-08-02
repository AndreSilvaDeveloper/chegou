import type { NextConfig } from 'next';

/**
 * A landing é servida na RAIZ do domínio (`/`); o painel vive em `/app/`.
 * Quem divide é o nginx da stack — ver `deploy/nginx/app.conf`.
 *
 * `output: 'standalone'` empacota só o necessário para rodar (`server.js` +
 * as dependências realmente usadas), em vez de copiar `node_modules` inteiro
 * para a imagem. É o que mantém o container pequeno num servidor que já roda
 * postgres, redis, minio e o OCR.
 */
const nextConfig: NextConfig = {
  output: 'standalone',

  // ESTA PASTA é a raiz do projeto — não o monorepo, nem o home do usuário.
  // Sem isto o Next adivinha a raiz procurando lockfile para cima, acha o da
  // raiz do repositório (ou um solto no perfil do Windows) e traça os arquivos
  // do `standalone` a partir de lá: build barulhento aqui, imagem errada lá.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,

  // A página é estática: sem isso, um `<img>` comum passaria pelo otimizador
  // do Next, que precisa de CPU e cache em disco para entregar o mesmo PNG.
  images: { unoptimized: true },

  // O `X-Powered-By: Next.js` só conta ao mundo qual stack atacar.
  poweredByHeader: false,

  // Barra final consistente evita `/precos` e `/precos/` indexarem como duas
  // páginas — conteúdo duplicado é o erro de SEO mais fácil de cometer sem
  // perceber.
  trailingSlash: false,
};

export default nextConfig;
