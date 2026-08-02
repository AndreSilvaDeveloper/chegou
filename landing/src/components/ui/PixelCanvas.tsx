'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { useMovimentoReduzido } from '@/hooks/use-movimento-reduzido';
import './PixelCanvas.css';

/**
 * Tons do âmbar da marca — os mesmos degraus 400/500/600 da rampa `primary`
 * do design system. Nada de amarelo inventado.
 */
const CORES = ['#FFD65C', '#FFC72C', '#E0A800'];

/** Espaço entre pixels. Maior = menos pixels = mais discreto. */
const VAO = 7;
/** Velocidade do cintilar, já na escala do original (valor × 0.001). */
const VELOCIDADE = 0.025;
/**
 * Lado máximo de cada pixel, em px.
 *
 * 1.5 e não 2: a malha passa por baixo do texto do cartão, e o que atrapalha
 * a leitura é a ÁREA de tinta, não a quantidade de pontos. Baixar o lado de
 * 2 para 1.5 tira ~44% da tinta (a área cai com o quadrado) sem ralear a
 * malha — o desenho continua o mesmo, só mais fino.
 */
const LADO_MAX = 1.5;

class Pixel {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly x: number;
  private readonly y: number;
  private readonly cor: string;
  private readonly velocidade: number;
  private readonly passo: number;
  private readonly ladoMin = 0.5;
  private readonly ladoMax: number;
  private readonly atraso: number;
  private readonly contadorPasso: number;

  private lado = 0;
  private contador = 0;
  private cintilando = false;
  private voltando = false;
  parado = false;

  constructor(
    ctx: CanvasRenderingContext2D,
    larg: number,
    alt: number,
    x: number,
    y: number,
    cor: string,
    velocidade: number,
    atraso: number,
  ) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.cor = cor;
    this.velocidade = (Math.random() * 0.8 + 0.1) * velocidade;
    this.passo = Math.random() * 0.4;
    this.ladoMax = Math.random() * (LADO_MAX - this.ladoMin) + this.ladoMin;
    this.atraso = atraso;
    this.contadorPasso = Math.random() * 4 + (larg + alt) * 0.01;
  }

  private desenhar(): void {
    const centro = LADO_MAX * 0.5 - this.lado * 0.5;
    this.ctx.fillStyle = this.cor;
    this.ctx.fillRect(this.x + centro, this.y + centro, this.lado, this.lado);
  }

  /** O atraso cresce com a distância ao centro: os pixels abrem em onda. */
  aparecer(): void {
    this.parado = false;
    if (this.contador <= this.atraso) {
      this.contador += this.contadorPasso;
      return;
    }
    if (this.lado >= this.ladoMax) this.cintilando = true;

    if (this.cintilando) {
      if (this.lado >= this.ladoMax) this.voltando = true;
      else if (this.lado <= this.ladoMin) this.voltando = false;
      this.lado += this.voltando ? -this.velocidade : this.velocidade;
    } else {
      this.lado += this.passo;
    }
    this.desenhar();
  }

  sumir(): void {
    this.cintilando = false;
    this.contador = 0;
    if (this.lado <= 0) {
      this.parado = true;
      return;
    }
    this.lado -= 0.1;
    this.desenhar();
  }
}

/**
 * A malha de pixels que cintila atrás do cartão em evidência.
 *
 * DIFERENÇA PARA A REFERÊNCIA: lá o gatilho é o hover. Aqui é `ativo` — quem
 * manda é a posição na pilha, e o cartão que assume a frente assume o efeito.
 * Hover não serviria: no celular ele não existe, e a pergunta que interessa
 * ("qual cartão está em evidência?") não tem nada a ver com o ponteiro.
 *
 * A animação se desliga sozinha quando todos os pixels chegam ao repouso —
 * um cartão parado não gasta quadro nenhum.
 */
export function PixelCanvas({ ativo }: { ativo: boolean }): ReactElement | null {
  const caixaRef = useRef<HTMLDivElement>(null);
  const telaRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<Pixel[]>([]);
  const pedidoRef = useRef(0);
  const reduzido = useMovimentoReduzido();

  // Monta a malha e refaz quando o cartão muda de tamanho.
  useEffect(() => {
    if (reduzido) return;
    const caixa = caixaRef.current;
    const tela = telaRef.current;
    if (!caixa || !tela) return;

    function montar() {
      const r = caixa!.getBoundingClientRect();
      const larg = Math.floor(r.width);
      const alt = Math.floor(r.height);
      if (larg <= 0 || alt <= 0) return;

      const ctx = tela!.getContext('2d');
      if (!ctx) return;

      tela!.width = larg;
      tela!.height = alt;
      tela!.style.width = `${larg}px`;
      tela!.style.height = `${alt}px`;

      const px: Pixel[] = [];
      for (let x = 0; x < larg; x += VAO) {
        for (let y = 0; y < alt; y += VAO) {
          const dx = x - larg / 2;
          const dy = y - alt / 2;
          px.push(
            new Pixel(
              ctx, larg, alt, x, y,
              CORES[Math.floor(Math.random() * CORES.length)],
              VELOCIDADE,
              Math.sqrt(dx * dx + dy * dy),
            ),
          );
        }
      }
      pixelsRef.current = px;
    }

    montar();
    const obs = new ResizeObserver(montar);
    obs.observe(caixa);
    return () => obs.disconnect();
  }, [reduzido]);

  // Abre ou fecha a malha conforme o cartão assume ou perde a frente.
  useEffect(() => {
    if (reduzido) return;
    const tela = telaRef.current;
    const ctx = tela?.getContext('2d');
    if (!tela || !ctx) return;

    let anterior = performance.now();

    function quadro() {
      pedidoRef.current = requestAnimationFrame(quadro);

      // Trava em 60fps: em tela de 120Hz o cintilar ficaria duas vezes mais
      // rápido só por causa do monitor.
      const agora = performance.now();
      const passou = agora - anterior;
      const intervalo = 1000 / 60;
      if (passou < intervalo) return;
      anterior = agora - (passou % intervalo);

      ctx!.clearRect(0, 0, tela!.width, tela!.height);
      let todosParados = true;
      for (const p of pixelsRef.current) {
        if (ativo) p.aparecer();
        else p.sumir();
        if (!p.parado) todosParados = false;
      }
      // Nada mais a mover: solta o rAF em vez de rodar em branco.
      if (todosParados && !ativo) cancelAnimationFrame(pedidoRef.current);
    }

    cancelAnimationFrame(pedidoRef.current);
    pedidoRef.current = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(pedidoRef.current);
  }, [ativo, reduzido]);

  if (reduzido) return null;

  return (
    <div className="pixels" ref={caixaRef} aria-hidden="true">
      <canvas ref={telaRef} />
    </div>
  );
}
