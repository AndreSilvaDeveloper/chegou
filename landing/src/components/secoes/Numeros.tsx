import type { ReactElement } from 'react';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { CenaLeitura, type CenaNumero } from '@/components/ui/CenaLeitura';
import { Faixa } from '@/components/ui/Faixa';
import { NumeroRolante } from '@/components/ui/NumeroRolante';
import { useEmVista } from '@/hooks/use-em-vista';
import { NUMEROS } from '@/lib/conteudo';
import './Numeros.css';

/**
 * O painel de leituras.
 *
 * Quatro instrumentos numa linha: o nome da grandeza, o valor grande rolando
 * até o lugar, a face do mostrador ao lado dele, e o que aquele número
 * significa.
 *
 * A metáfora é a que o design system já declara — "central de portaria",
 * "mesa de controle" — e é ela que separa esta seção das outras, todas feitas
 * de cartão.
 *
 * A rolagem dispara UMA vez, quando a seção entra. Repetir a cada passagem
 * transformaria um dado em enfeite.
 */
export function Numeros(): ReactElement {
  const [ref, visivel] = useEmVista<HTMLDivElement>({
    umaVez: true,
    margem: '0px 0px -15% 0px',
    limiar: 0.2,
  });

  return (
    <Faixa>
      <CabecaSecao eyebrow={NUMEROS.eyebrow} titulo={NUMEROS.titulo} />

      <div className="painel" ref={ref} data-vivo={visivel ? 'sim' : 'nao'}>
        {NUMEROS.itens.map((item) => (
          <div className="leitura" key={item.rotulo}>
            <p className="eyebrow leitura__rotulo">{item.rotulo}</p>

            {/* O valor e a face dividem a linha: é o par que faz o conjunto
                ler como instrumento — mostrador de um lado, leitura do outro. */}
            <div className="leitura__linha">
              <p className="leitura__valor">
                <NumeroRolante valor={item.valor} ativo={visivel} />
              </p>
              <CenaLeitura cena={item.cena as CenaNumero} />
            </div>
            <p className="t-apoio">{item.texto}</p>
          </div>
        ))}
      </div>
    </Faixa>
  );
}
