'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { Marca } from '@/components/marca/Marca';
import { Botao } from '@/components/ui/Botao';
import { BotaoTema } from './BotaoTema';
import { Hamburguer, MenuMovel, MenuPilulas } from './Menu';
import { useSecaoAtiva } from '@/hooks/use-secao-ativa';
import { NAVEGACAO, TOPO } from '@/lib/conteudo';
import './Topo.css';

const IDS = NAVEGACAO.map((n) => n.id);

/**
 * A barra fixa do topo.
 *
 * Ela só ganha borda depois que a página rola: parada no alto, a linha
 * dividiria o topo de um hero que continua nele.
 */
export function Topo(): ReactElement {
  const [rolou, setRolou] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const ativa = useSecaoAtiva(IDS);

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 8);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  return (
    <header className="topo" id="topo" data-rolou={rolou ? 'sim' : 'nao'}>
      <div className="wrap topo__linha">
        <div className="topo__marca">
          <Marca />
        </div>
        <div className="topo__menu-pilulas">
          <MenuPilulas ativa={ativa} />
        </div>
        <div className="topo__acoes">
          <BotaoTema />
          <Botao href={TOPO.acao.href} className="topo__login">
            {TOPO.acao.rotulo}
          </Botao>
          {/* Por último: no celular o hambúrguer é o item mais à direita, na
              quina onde o polegar alcança. É também o único que abre algo
              ancorado abaixo dele. */}
          <Hamburguer aberto={menuAberto} aoAlternar={() => setMenuAberto((v) => !v)} />
        </div>
      </div>

      <MenuMovel aberto={menuAberto} aoFechar={() => setMenuAberto(false)} ativa={ativa} />
    </header>
  );
}

/** Link de pular para o conteúdo — o primeiro foco de quem navega por teclado. */
export function PularParaConteudo(): ReactElement {
  return (
    <a className="pular" href="#conteudo">
      Pular para o conteúdo
    </a>
  );
}
