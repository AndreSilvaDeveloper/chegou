'use client';

import type { ReactElement } from 'react';
import { CabecaSecao } from '@/components/ui/CabecaSecao';
import { Cartao } from '@/components/ui/Cartao';
import { Faixa } from '@/components/ui/Faixa';
import { ListaCheck } from '@/components/ui/ListaCheck';
import { Revelar } from '@/components/ui/Revelar';
import type { NomeIcone } from '@/components/ui/Icone';
import { PERFIS } from '@/lib/conteudo';
import './Perfis.css';

/**
 * Quem trabalha no prédio. Os três perfis do sistema, com o que cada um vê —
 * um sistema que serve o síndico mas atrapalha o porteiro não é usado.
 */
export function Perfis(): ReactElement {
  return (
    <Faixa tom="card">
      <CabecaSecao eyebrow={PERFIS.eyebrow} titulo={PERFIS.titulo} apoio={PERFIS.apoio} />

      <div className="perfis">
        {PERFIS.itens.map((perfil, i) => (
          <Revelar key={perfil.papel} atraso={i * 60}>
            <Cartao
              familia="perfil"
              icone={perfil.icone as NomeIcone}
              aoLado={
                <div>
                  <p className="perfil__papel">{perfil.papel}</p>
                  <h3 className="t-subtitulo">{perfil.titulo}</h3>
                </div>
              }
            >
              <p className="t-apoio">{perfil.texto}</p>
              <ListaCheck itens={perfil.itens} />
            </Cartao>
          </Revelar>
        ))}
      </div>
    </Faixa>
  );
}
