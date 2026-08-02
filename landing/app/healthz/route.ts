/**
 * `/healthz` — o que o healthcheck do container pergunta.
 *
 * Existe para o Docker não ter de baixar a home inteira a cada 30 segundos só
 * para saber se o processo está de pé. É a mesma rota que o `web/nginx.conf`
 * expõe no painel, de propósito: um único endereço para os dois front-ends.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response('ok', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
