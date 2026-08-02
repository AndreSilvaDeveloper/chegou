'use client';

import type { ReactElement } from 'react';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { Faixa } from '@/components/ui/Faixa';
import { ListaCheck } from '@/components/ui/ListaCheck';
import { Revelar } from '@/components/ui/Revelar';
import { Selo } from '@/components/ui/Selo';
import { Texto } from '@/components/ui/Texto';
import { PRECO } from '@/lib/conteudo';
import './Preco.css';

/**
 * O preço, na tabela.
 *
 * A régua de recibo (ponteado levando ao valor, mono com `tabular-nums`) é
 * deliberada: publicar o número enquanto o mercado esconde atrás de "veja na
 * demonstração" é diferenciação barata — e alinhar os centavos é o que deixa
 * as três faixas comparáveis de relance.
 */
export function Preco(): ReactElement {
  return (
    <Faixa id="preco">
      <CabecaSecao eyebrow={PRECO.eyebrow} titulo={PRECO.titulo} apoio={PRECO.apoio} />

      <div className="preco-grade">
        <Revelar>
          <div className="recibo">
            <div className="recibo__cabeca">
              <div>
                <p className="eyebrow">Mensalidade</p>
                <p className="t-secao" style={{ marginTop: '.25rem' }}>
                  Por apartamento ativo
                </p>
              </div>
              <Selo>sem fidelidade</Selo>
            </div>

            {PRECO.faixas.map((faixa) => (
              <div className="faixa-preco" key={faixa.rotulo}>
                <span className="faixa-preco__nome">{faixa.rotulo}</span>
                <span className="faixa-preco__linha" aria-hidden="true" />
                <span className="faixa-preco__valor">
                  {faixa.valor} <small>/apto</small>
                </span>
              </div>
            ))}

            <div className="exemplo">
              <p>
                <Texto>{PRECO.exemplo.texto}</Texto>
              </p>
              <div className="exemplo__conta">
                <span>{PRECO.exemplo.conta}</span>
                <b>{PRECO.exemplo.total}</b>
              </div>
            </div>
          </div>
        </Revelar>

        <div className="inclui">
          <Revelar>
            <div className="inclui__caixa">
              <h3 className="t-secao" style={{ marginBottom: '.85rem' }}>
                {PRECO.inclui.titulo}
              </h3>
              <ListaCheck itens={PRECO.inclui.itens} />
            </div>
          </Revelar>

          <Revelar>
            <div className="inclui__caixa inclui__caixa--sinal">
              <p className="eyebrow">{PRECO.administradoras.eyebrow}</p>
              <p className="t-apoio" style={{ marginTop: '.5rem', color: 'var(--tinta)' }}>
                <Texto>{PRECO.administradoras.texto}</Texto>
              </p>
            </div>
          </Revelar>

          <p className="t-apoio">{PRECO.rodape}</p>
        </div>
      </div>
    </Faixa>
  );
}
