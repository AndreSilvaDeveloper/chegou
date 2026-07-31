import type { CSSProperties, ReactElement, Ref } from 'react';
import { cn, vars } from '@/lib/css';
import { CenaCartao, type Cena } from './CenaCartao';
import { Icone, type NomeIcone } from './Icone';
import { Texto } from './Texto';
import './CartaoVira.css';

interface Props {
  icone: NomeIcone;
  /** O desenho animado da frente — um por argumento. */
  cena: Cena;
  titulo: string;
  /** A frente: a frase curta que se lê de relance. */
  chamada: string;
  /** O verso: o argumento inteiro. */
  texto: string;
  itens?: readonly string[];
  className?: string;
  /**
   * Precisa chegar ao DOM: quem envolve o cartão (`Revelar`) observa este nó
   * para saber quando ele entra na tela. Ver o contrato em `Revelar`.
   */
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}

/**
 * O cartão que vira ao passar o mouse: chamada na frente, argumento no verso.
 *
 * SEM ESTADO REACT, ao contrário da referência. O giro, o escalonamento dos
 * itens e o brilho saem de `:hover` e `:focus-within` no CSS — não há
 * `useState`, nem handler de mouse, nem re-render. Estado de interação que o
 * CSS já sabe representar não precisa subir para o JavaScript.
 *
 * `:focus-within` é o que faz o verso existir para quem navega por teclado: só
 * `:hover` deixaria o conteúdo inalcançável sem mouse.
 *
 * A FRENTE É `aria-hidden`. Ela é um resumo do verso, e sem isso o leitor de
 * tela anunciaria o mesmo título duas vezes — `backface-visibility` esconde
 * dos olhos, não da leitura.
 *
 * No toque não existe hover: lá o CSS desmonta o cartão e mostra só o verso
 * (ver `CartaoVira.css`). Esconder conteúdo atrás de um gesto que o aparelho
 * não tem seria perdê-lo.
 */
export function CartaoVira({
  icone,
  cena,
  titulo,
  chamada,
  texto,
  itens,
  className,
  ref,
  style,
}: Props): ReactElement {
  return (
    <div ref={ref} style={style} className={cn('vira', className)} tabIndex={0}>
      <div className="vira__eixo">
        <article className="vira__face vira__frente" aria-hidden="true">
          <CenaCartao cena={cena} />

          <div className="vira__rodape">
            <div>
              <h3 className="t-secao">{titulo}</h3>
              <p className="t-apoio">{chamada}</p>
            </div>
            <span className="vira__girar">
              <Icone nome="virar" tamanho={16} strokeWidth={2.2} />
            </span>
          </div>
        </article>

        <article className="vira__face vira__verso">
          <span className={cn('tijolo__marca')} aria-hidden="true">
            <Icone nome={icone} tamanho={22} />
          </span>
          <h3 className="t-secao">{titulo}</h3>
          <p className="t-apoio">
            <Texto>{texto}</Texto>
          </p>

          {itens && (
            <ul className="vira__itens">
              {itens.map((item, i) => (
                <li key={item} style={vars({ '--i': i })}>
                  <Icone nome="seta" tamanho={13} strokeWidth={2.4} />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </div>
  );
}
