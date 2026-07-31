import type { ReactElement } from 'react';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { CaixasGrade } from '@/components/ui/CaixasGrade';
import { Faixa } from '@/components/ui/Faixa';
import { Icone } from '@/components/ui/Icone';
import { Revelar } from '@/components/ui/Revelar';
import { Texto } from '@/components/ui/Texto';
import { DUVIDAS } from '@/lib/conteudo';
import './Duvidas.css';

/**
 * As objeções, respondidas.
 *
 * `<details>`/`<summary>` nativos: abrem sem JS, são acessíveis por teclado de
 * fábrica e o navegador já os expõe corretamente ao leitor de tela.
 *
 * A lista tem largura de leitura (48rem), o que deixava metade da faixa vazia
 * no desktop. O campo de encomendas ocupa esse vão — é decoração, mas
 * decoração num espaço que já era desperdício.
 */
export function Duvidas(): ReactElement {
  return (
    <Faixa id="duvidas" tom="card">
      <CabecaSecao eyebrow={DUVIDAS.eyebrow} titulo={DUVIDAS.titulo} />

      <div className="duvidas__grade">
        <div className="faq">
          {DUVIDAS.itens.map((item, i) => (
            <Revelar key={item.pergunta} atraso={i * 50}>
              <details className="pergunta">
                <summary>
                  {item.pergunta}
                  <Icone nome="chevron" tamanho={18} strokeWidth={2.2} />
                </summary>
                <div className="pergunta__corpo">
                  <Texto>{item.resposta}</Texto>
                </div>
              </details>
            </Revelar>
          ))}
        </div>

        {/* O vão à direita da lista. O campo o ocupa em vez de deixá-lo vazio,
            e acompanha a altura da coluna de perguntas — inclusive quando uma
            resposta abre e a lista cresce. */}
        <div className="duvidas__campo">
          <CaixasGrade />
        </div>
      </div>
    </Faixa>
  );
}
