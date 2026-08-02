import type { ReactElement } from 'react';
import { Marca } from '@/components/marca/Marca';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { LINK_DEMO, MARCA, RODAPE, TOPO } from '@/lib/conteudo';
import './Rodape.css';

/**
 * Só entra na fileira quem tem link. Ver o TODO em `RODAPE.social`.
 *
 * O teste é por comprimento, e não `!== ''`: com `as const`, o `href` de cada
 * rede tem o tipo do PRÓPRIO literal, então assim que todas ganham URL o
 * `tsc` passa a acusar a comparação com `''` como sem sobreposição possível.
 * O guard tem de sobreviver aos dois estados da lista — vazia e preenchida.
 */
const SOCIAL = RODAPE.social.filter((r) => r.href.trim().length > 0);

/**
 * O rodapé.
 *
 * É um PAINEL apoiado sobre a página, não uma faixa colada na borda inferior —
 * a mesma peça arredondada que o resto da landing usa para conteúdo.
 *
 * **Ele não usa `.wrap`**, ao contrário de todas as outras seções. Aquela
 * classe impõe `max-width: 74rem`, e este painel é largo de propósito: ele vai
 * quase de borda a borda, com um respiro lateral que vem do próprio `.rodape`.
 *
 * O ano sai de `new Date()` no render. Isto é pré-renderizado no build, ou seja,
 * o ano é o do build — e não o de quem visita. Na virada de janeiro ele só
 * atualiza no próximo deploy. Aceito: o rodapé já era assim, e a alternativa
 * (ler a data no cliente) custaria uma divergência de hidratação para consertar
 * um número que ninguém confere.
 */
export function Rodape(): ReactElement {
  return (
    <footer className="rodape">
      <div className="rodape__painel">
        <div className="rodape__corpo">
          <div className="rodape__marca-bloco">
            <Marca />
            <p className="rodape__descricao">{MARCA.descricao}</p>
            <a className="rodape__email" href={`mailto:${MARCA.email}`}>
              {MARCA.email}
            </a>
          </div>

          <nav className="rodape__links" aria-label="Seções do site">
            {RODAPE.links.map((link) => (
              <a href={link.href} key={link.rotulo}>
                {link.rotulo}
              </a>
            ))}
          </nav>

          <div className="rodape__acoes">
            <Botao href={TOPO.acao.href}>{TOPO.acao.rotulo}</Botao>
            <Botao href={LINK_DEMO} variante="linha">
              Agendar demonstração
            </Botao>
          </div>
        </div>

        <div className="rodape__base">
          <span>
            © {new Date().getFullYear()} {MARCA.completo} · Central de Portaria
          </span>

          {SOCIAL.length > 0 ? (
            <ul className="rodape__social">
              {SOCIAL.map((rede) => (
                <li key={rede.rede}>
                  <a
                    href={rede.href}
                    aria-label={rede.rede}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {/* Sem cast em `nome`: se alguém puser em `RODAPE.social`
                        uma rede cujo ícone não existe em `Icone.tsx`, o `tsc`
                        acusa aqui — que é onde dá para consertar. */}
                    <Icone nome={rede.icone} tamanho={18} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <span className="mono t-nota">{RODAPE.assinatura}</span>
          )}
        </div>
      </div>
    </footer>
  );
}
