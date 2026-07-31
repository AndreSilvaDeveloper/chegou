import type { ReactElement } from 'react';
import { cn } from '@/lib/css';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { CartaoVira } from '@/components/ui/CartaoVira';
import { Faixa } from '@/components/ui/Faixa';
import { Revelar } from '@/components/ui/Revelar';
import type { Cena } from '@/components/ui/CenaCartao';
import type { NomeIcone } from '@/components/ui/Icone';
import { DIFERENCA } from '@/lib/conteudo';
import './Diferenca.css';

/**
 * As cinco decisões que separam o produto do resto do mercado.
 *
 * Cada uma é um cartão que vira: a chamada de frente, o argumento no verso.
 * O formato serve ao conteúdo aqui — são cinco afirmações que se leem de
 * relance e cinco justificativas longas, e mostrar as duas coisas ao mesmo
 * tempo é o que fazia esta seção ser um paredão de texto.
 */
export function Diferenca(): ReactElement {
  return (
    <Faixa id="diferenca" tom="card">
      <CabecaSecao
        eyebrow={DIFERENCA.eyebrow}
        titulo={DIFERENCA.titulo}
        apoio={DIFERENCA.apoio}
      />

      <div className="bento">
        {DIFERENCA.tijolos.map((tijolo, i) => (
          <Revelar key={tijolo.titulo} atraso={i * 60}>
            <CartaoVira
              icone={tijolo.icone as NomeIcone}
              cena={tijolo.cena as Cena}
              titulo={tijolo.titulo}
              chamada={tijolo.chamada}
              texto={tijolo.texto}
              itens={'itens' in tijolo ? tijolo.itens : undefined}
              className={cn(
                'largo' in tijolo && tijolo.largo && 'tijolo--largo',
                'destaque' in tijolo && tijolo.destaque && 'tijolo--destaque',
              )}
            />
          </Revelar>
        ))}
      </div>
    </Faixa>
  );
}
