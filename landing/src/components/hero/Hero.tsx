import { useRef, type ReactElement } from 'react';
import { Botao } from '@/components/ui/Botao';
import { Icone } from '@/components/ui/Icone';
import { Texto } from '@/components/ui/Texto';
import { useEmVista } from '@/hooks/use-em-vista';
import { HERO, LINK_DEMO } from '@/lib/conteudo';
import { Baloes } from './Baloes';
import { CaixaPredio } from './CaixaPredio';
import { CaixasCaindo } from './CaixasCaindo';
import { FormasAoFundo, MalhaAmbar, Veu } from './Fundo';
import { RotasEntrega } from './RotasEntrega';
import './Hero.css';

/**
 * O hero.
 *
 * A ordem dos filhos é a profundidade da cena, do fundo para a frente:
 * formas → malha âmbar → caixas caindo → rotas → véu → conteúdo.
 *
 * Um observador só decide se o fundo inteiro roda: ele liga o rAF do canvas e,
 * pelo `data-parada`, congela as animações CSS das caixas, das formas e da
 * malha. Nove camadas borradas animando fora da tela é gasto puro de bateria —
 * e quem abre esta página no celular é a mesma pessoa que passa o turno com
 * ele na mão.
 *
 * A coluna de texto é passada às rotas para que o canvas APAGUE o próprio
 * desenho por cima dela: linha fina cruzando parágrafo atrapalha a leitura, e
 * a área exata só o elemento sabe dizer.
 */
export function Hero(): ReactElement {
  const [refHero, emVista] = useEmVista<HTMLElement>({ limiar: 0 });
  const palcoRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLDivElement>(null);

  return (
    <section className="hero" ref={refHero} data-parada={emVista ? 'nao' : 'sim'}>
      <FormasAoFundo />
      <MalhaAmbar />
      <CaixasCaindo />
      <RotasEntrega palcoRef={palcoRef} textoRef={textoRef} ativo={emVista} />
      <Veu />

      <div className="wrap hero__grade">
        <div className="hero__texto" ref={textoRef}>
          <h1 className="t-display">
            {HERO.tituloLinha1}
            <br />
            <span className="sinal">{HERO.tituloLinha2}</span>
          </h1>

          <p className="hero__sub">
            {/* O brilho passa pelo trecho em `**` do conteúdo. */}
            <Texto brilho>{HERO.subtitulo}</Texto>
          </p>

          <div className="hero__acoes">
            <Botao href={LINK_DEMO} grande>
              {HERO.acaoPrimaria}
              <Icone nome="seta" tamanho={18} strokeWidth={2.2} />
            </Botao>
            <Botao href="#funciona" variante="linha" grande>
              {HERO.acaoSecundaria}
            </Botao>
          </div>
        </div>

        {/* A tese da página: a marca encenando o produto. */}
        <div className="palco" ref={palcoRef}>
          <Baloes />
          <CaixaPredio />
        </div>
      </div>
    </section>
  );
}
