import type { ReactElement } from 'react';
import { Botao } from '@/components/ui/Botao';
import { Faixa } from '@/components/ui/Faixa';
import { Icone } from '@/components/ui/Icone';
import { Revelar } from '@/components/ui/Revelar';
import { CHAMADA, LINK_DEMO } from '@/lib/conteudo';
import './ChamadaFinal.css';

/** O fecho: a promessa do hero, agora como convite. */
export function ChamadaFinal(): ReactElement {
  return (
    <Faixa id="chamada">
      <Revelar>
        <div className="chamada">
          <div className="chamada__brilho" aria-hidden="true" />
          <div className="chamada__miolo">
            <p className="eyebrow">{CHAMADA.eyebrow}</p>
            <h2 className="t-display chamada__titulo">
              {CHAMADA.tituloLinha1}
              <br />
              {CHAMADA.tituloLinha2}
            </h2>
            <p className="t-apoio chamada__apoio">{CHAMADA.apoio}</p>

            <div className="hero__acoes chamada__acoes">
              <Botao href={LINK_DEMO} grande>
                {CHAMADA.acaoPrimaria}
                <Icone nome="seta" tamanho={18} strokeWidth={2.2} />
              </Botao>
              <Botao href="#preco" variante="linha" grande>
                {CHAMADA.acaoSecundaria}
              </Botao>
            </div>

            <p className="t-nota chamada__nota">{CHAMADA.nota}</p>
          </div>
        </div>
      </Revelar>
    </Faixa>
  );
}
