import type { ReactElement } from 'react';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { Cartao } from '@/components/ui/Cartao';
import { Faixa } from '@/components/ui/Faixa';
import { Icone, type NomeIcone } from '@/components/ui/Icone';
import { Revelar } from '@/components/ui/Revelar';
import { Texto } from '@/components/ui/Texto';
import { PROBLEMA } from '@/lib/conteudo';
import './Problema.css';

/**
 * A dor. É o pivô emocional da página — e a única seção cujo título sobe letra
 * a letra: acento repetido em toda seção viraria maneirismo.
 *
 * O ícone de cada cartão pulsa devagar — um sinal discreto de que ali há algo
 * vivo, sem tirar a seção do lugar.
 */
export function Problema(): ReactElement {
  return (
    <Faixa id="problema" tom="card">
      <CabecaSecao
        eyebrow={PROBLEMA.eyebrow}
        titulo={PROBLEMA.titulo}
        apoio={PROBLEMA.apoio}
        flutuante
      />

      <div className="dores">
        {PROBLEMA.dores.map((dor, i) => (
          <Revelar key={dor.titulo} atraso={i * 60}>
            <Cartao familia="dor" icone={dor.icone as NomeIcone}>
              <h3 className="t-subtitulo">{dor.titulo}</h3>
              <p className="t-apoio">
                <Texto>{dor.texto}</Texto>
              </p>
            </Cartao>
          </Revelar>
        ))}
      </div>

      <Revelar>
        <div className="viravolta">
          <span className="viravolta__marca" aria-hidden="true">
            <Icone nome="ajuste" tamanho={20} strokeWidth={2.2} />
          </span>
          <div className="viravolta__texto">
            <p className="eyebrow">{PROBLEMA.viravolta.eyebrow}</p>
            <p className="viravolta__nega">{PROBLEMA.viravolta.nega}</p>
            <p className="viravolta__afirma">
              <Texto>{PROBLEMA.viravolta.afirma}</Texto>
            </p>
          </div>
        </div>
      </Revelar>
    </Faixa>
  );
}
