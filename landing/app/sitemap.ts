import type { MetadataRoute } from 'next';
import { URL_SITE } from '@/lib/site';

/**
 * Gerado no build, servido em `/sitemap.xml`.
 *
 * Uma página só hoje. O arquivo existe mesmo assim porque é ele que o
 * `robots.txt` aponta, e porque a segunda página (um `/precos`, um post) entra
 * aqui como uma linha em vez de virar uma tarefa de "configurar sitemap".
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: URL_SITE,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
