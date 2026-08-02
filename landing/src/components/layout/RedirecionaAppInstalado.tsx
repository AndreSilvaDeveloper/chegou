'use client';

import { useEffect } from 'react';
import { TOPO } from '@/lib/conteudo';

/**
 * Aberto pelo atalho do app instalado? Então vai para o painel, não para o
 * marketing.
 *
 * POR QUE ISTO EXISTE: quem instalou o PWA antes da landing tem um atalho na
 * tela do celular apontando para o `start_url` antigo — a RAIZ do domínio, que
 * hoje é esta página. O painel mudou para `/app/`, mas o atalho já impresso no
 * aparelho de cada porteiro não se atualiza sozinho; sem isto, ele toca o ícone
 * do sistema e cai no site de vendas.
 *
 * COMO DETECTA: `display-mode` diz se a página está numa janela de app em vez
 * de numa aba do navegador. As três variações cobrem como cada plataforma
 * instala, e o `navigator.standalone` cobre o iOS, que nunca implementou
 * `display-mode`.
 *
 * Só vale para app INSTALADO. Quem chega pelo navegador — visitante, buscador,
 * agente de IA — continua vendo a landing normalmente, que é o motivo de ela
 * existir. Um crawler nunca roda em `standalone`, então SEO não é afetado.
 *
 * `location.replace` e não `href`: a landing não fica no histórico, senão o
 * "voltar" do aparelho traria o usuário para cá e o redirect dispararia de
 * novo, prendendo ele num pingue-pongue.
 *
 * Vai para a tela de login e não para `/app/`: quem já tem sessão é desviado
 * sozinho pelo painel (`if (getToken()) return <Navigate to="/encomendas" />`
 * em `web/src/pages/Login.tsx`), então o mesmo destino serve aos dois casos.
 */
export function RedirecionaAppInstalado(): null {
  useEffect(() => {
    const emApp =
      ['standalone', 'fullscreen', 'minimal-ui'].some(
        (modo) => window.matchMedia(`(display-mode: ${modo})`).matches,
      ) ||
      // iOS: propriedade própria da Apple, fora do padrão e só no Safari.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (emApp) window.location.replace(TOPO.acao.href);
  }, []);

  return null;
}
