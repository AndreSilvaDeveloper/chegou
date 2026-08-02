import type { MetadataRoute } from 'next';
import { URL_SITE } from '@/lib/site';

/**
 * Gerado no build, servido em `/robots.txt`.
 *
 * **Os agentes de IA são liberados de propósito** (GPTBot, ClaudeBot,
 * PerplexityBot e companhia). Muito site os bloqueia por reflexo; para um
 * produto que quer ser *recomendado* quando alguém pergunta "qual sistema de
 * portaria usar", ser lido por eles é o canal, não o vazamento.
 *
 * `/app/` fica de fora: é o painel, 100% atrás de login. Não há o que indexar
 * ali, e deixar o crawler bater lá só gasta orçamento de rastreio no 401.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/app/', '/api/'],
      },
    ],
    sitemap: `${URL_SITE}/sitemap.xml`,
    host: URL_SITE,
  };
}
