import type { ReactElement } from 'react';
import { Marca } from '@/components/marca/Marca';
import { MARCA, RODAPE } from '@/lib/conteudo';
import './Rodape.css';

export function Rodape(): ReactElement {
  return (
    <footer className="rodape">
      <div className="wrap">
        <div className="rodape__grade">
          <div className="rodape__col">
            <Marca />
            <p className="t-apoio" style={{ maxWidth: '24rem' }}>
              {MARCA.descricao}
            </p>
          </div>

          {RODAPE.colunas.map((coluna) => (
            <nav className="rodape__col" key={coluna.titulo} aria-label={coluna.titulo}>
              <p className="eyebrow">{coluna.titulo}</p>
              {coluna.links.map((link) => (
                <a href={link.href} key={link.rotulo}>
                  {link.rotulo}
                </a>
              ))}
            </nav>
          ))}
        </div>

        <div className="rodape__base">
          <span>
            © {new Date().getFullYear()} {MARCA.completo} · Central de Portaria
          </span>
          <span className="mono t-nota">{RODAPE.assinatura}</span>
        </div>
      </div>
    </footer>
  );
}
