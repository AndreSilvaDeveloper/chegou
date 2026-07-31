import { useCallback, useRef, useState, type ReactElement } from 'react';
import { vars } from '@/lib/css';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { CartaoPasso } from '@/components/ui/Cartao';
import { Faixa } from '@/components/ui/Faixa';
import { Texto } from '@/components/ui/Texto';
import { useEmVista } from '@/hooks/use-em-vista';
import { useMovimentoReduzido } from '@/hooks/use-movimento-reduzido';
import { usePilha } from '@/hooks/use-pilha';
import { COMO_FUNCIONA } from '@/lib/conteudo';
import './ComoFunciona.css';

/**
 * Os três passos, com a tela travada.
 *
 * Ao chegar aqui a página para: a rolagem passa a trazer um cartão de cada
 * vez, cada um parando um degrau abaixo do anterior. Depois do último, a
 * página volta a rolar.
 *
 * O cabeçalho fica DENTRO do palco, não acima da pista — assim ele continua
 * na tela enquanto os cartões entram, e a pessoa não perde de vista do que a
 * seção trata durante os três avanços.
 */
export function ComoFunciona(): ReactElement {
  const pistaRef = useRef<HTMLDivElement>(null);
  const [refVista, emVista] = useEmVista<HTMLDivElement>({ limiar: 0 });
  const reduzido = useMovimentoReduzido();

  /* Qual cartão está em evidência. Só ele acende a malha de pixels; quando o
     seguinte cobre este, a evidência (e o efeito) trocam de dono. */
  const [frente, setFrente] = useState(0);
  /* `useCallback` porque a identidade da função entra nas dependências do
     hook — recriá-la a cada render reiniciaria o rAF da pilha sem motivo. */
  const aoTrocarFrente = useCallback((i: number) => setFrente(i), []);

  usePilha(pistaRef, emVista && !reduzido, aoTrocarFrente);

  return (
    <Faixa id="funciona">
      <div
        className="pilha"
        ref={pistaRef}
        style={vars({ '--n': COMO_FUNCIONA.passos.length })}
      >
        <div className="pilha__palco" ref={refVista}>
          <CabecaSecao
            eyebrow={COMO_FUNCIONA.eyebrow}
            titulo={COMO_FUNCIONA.titulo}
            apoio={COMO_FUNCIONA.apoio}
          />

          <ol className="passos pilha__cartoes">
            {COMO_FUNCIONA.passos.map((passo, i) => (
              <CartaoPasso
                key={passo.titulo}
                indice={i}
                tempo={passo.tempo}
                emEvidencia={i === frente}
              >
                <h3 className="t-secao">{passo.titulo}</h3>
                <p className="t-apoio">
                  <Texto>{passo.texto}</Texto>
                </p>
              </CartaoPasso>
            ))}
          </ol>
        </div>
      </div>
    </Faixa>
  );
}
