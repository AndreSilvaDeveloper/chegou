import type { ReactElement } from 'react';
import { PularParaConteudo, Topo } from '@/components/layout/Topo';
import { Rodape } from '@/components/layout/Rodape';
import { Hero } from '@/components/hero/Hero';
import { Problema } from '@/components/secoes/Problema';
import { ComoFunciona } from '@/components/secoes/ComoFunciona';
import { Diferenca } from '@/components/secoes/Diferenca';
import { Numeros } from '@/components/secoes/Numeros';
import { Perfis } from '@/components/secoes/Perfis';
import { Preco } from '@/components/secoes/Preco';
import { Duvidas } from '@/components/secoes/Duvidas';
import { ChamadaFinal } from '@/components/secoes/ChamadaFinal';

/**
 * A página, na ordem em que ela argumenta:
 *
 *   promessa → dor → como funciona → o que só nós fazemos → prova
 *   → para quem é → quanto custa → objeções → convite
 *
 * Este arquivo não sabe COMO nada é desenhado. Ele só diz a ordem — e é por
 * isso que reordenar a narrativa é mover uma linha.
 *
 * Ele é um **Server Component**: a árvore inteira é renderizada para HTML no
 * build. As peças com `'use client'` abaixo continuam sendo pré-renderizadas —
 * `'use client'` diz onde o JS *hidrata*, não onde o HTML nasce. É o que
 * garante que um agente de IA sem execução de script leia a página inteira.
 */
export default function Pagina(): ReactElement {
  return (
    <>
      <PularParaConteudo />
      <Topo />

      <main id="conteudo">
        <Hero />
        <Problema />
        <ComoFunciona />
        <Diferenca />
        <Numeros />
        <Perfis />
        <Preco />
        <Duvidas />
        <ChamadaFinal />
      </main>

      <Rodape />
    </>
  );
}
