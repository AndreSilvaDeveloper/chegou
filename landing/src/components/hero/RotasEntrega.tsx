'use client';

import { useEffect, useRef, type ReactElement, type RefObject } from 'react';
import { useMovimentoReduzido } from '@/hooks/use-movimento-reduzido';

const PASSO = 40;        // passo dos cotovelos: dá cadência de quarteirão
const QUANTAS = 11;
const COMP_RASTRO = 0.15;
const PONTOS_RASTRO = 10;

interface Ponto { x: number; y: number }
interface Rota { pts: Ponto[]; segs: number[]; total: number; t: number; espera: number; vel: number }

const naGrade = (v: number) => Math.round(v / PASSO) * PASSO;

/** Entra por uma borda, dá um cotovelo e chega no destino. */
function novaRota(larg: number, alt: number, destino: Ponto, espera: number): Rota {
  const lado = Math.floor(Math.random() * 4);
  let sx: number, sy: number;
  if (lado === 0) { sx = -30; sy = naGrade(Math.random() * alt); }
  else if (lado === 1) { sx = larg + 30; sy = naGrade(Math.random() * alt); }
  else if (lado === 2) { sx = naGrade(Math.random() * larg); sy = -30; }
  else { sx = naGrade(Math.random() * larg); sy = alt + 30; }

  const dx = naGrade(destino.x), dy = naGrade(destino.y);
  const meio = 0.3 + Math.random() * 0.4;
  const pts: Ponto[] =
    lado === 0 || lado === 1
      ? (() => { const mx = naGrade(sx + (dx - sx) * meio);
          return [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: dy }, { x: dx, y: dy }]; })()
      : (() => { const my = naGrade(sy + (dy - sy) * meio);
          return [{ x: sx, y: sy }, { x: sx, y: my }, { x: dx, y: my }, { x: dx, y: dy }]; })();

  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    segs.push(d); total += d;
  }
  return { pts, segs, total: total || 1, t: 0, espera, vel: 0.055 + Math.random() * 0.05 };
}

function pontoEm(r: Rota, p: number): Ponto {
  let d = Math.max(0, Math.min(1, p)) * r.total;
  for (let i = 0; i < r.segs.length; i++) {
    if (d <= r.segs[i] || i === r.segs.length - 1) {
      const a = r.pts[i], b = r.pts[i + 1];
      const f = r.segs[i] ? Math.min(1, d / r.segs[i]) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    d -= r.segs[i];
  }
  return r.pts[r.pts.length - 1];
}

/**
 * As entregas a caminho, no fundo do hero.
 *
 * Canvas 2D, sem biblioteca. Cada rota entra por uma borda e chega na
 * caixa-prédio andando SÓ na horizontal e na vertical — o ângulo reto e o passo
 * constante são o que faz ler como rua em vez de risco solto. Ao chegar, um
 * anel pulsa no endereço e a rota renasce em outro ponto.
 *
 * A referência (Hyperspeed) é uma estrada em WebGL vindo na sua direção:
 * bonita, mas genérica e cara — three.js mais postprocessing. Aqui o assunto é
 * entrega chegando a um endereço, que é o produto.
 *
 * O destino é lido do elemento do palco, não chutado: quando o layout empilha
 * no celular, as rotas continuam acertando o alvo.
 */
export function RotasEntrega({
  palcoRef,
  textoRef,
  ativo,
}: {
  palcoRef: RefObject<HTMLElement | null>;
  /** A coluna de texto. O desenho é apagado sobre ela — ver `apagarSobreTexto`. */
  textoRef: RefObject<HTMLElement | null>;
  ativo: boolean;
}): ReactElement {
  const telaRef = useRef<HTMLCanvasElement>(null);
  const reduzido = useMovimentoReduzido();

  useEffect(() => {
    const tela = telaRef.current;
    const hero = tela?.parentElement;
    const ctx = tela?.getContext('2d');
    if (!tela || !hero || !ctx) return;

    let larg = 0, alt = 0, pedido = 0, ultimo = 0;
    let rotas: Rota[] = [];
    let aneis: { t: number }[] = [];
    const destino: Ponto = { x: 0, y: 0 };
    /** Retângulo da coluna de texto, em coordenadas do hero. */
    let zonaTexto: { x: number; y: number; w: number; h: number } | null = null;
    const tinta = { sinal: '#FFC72C', rua: '#D7D0C6' };

    function lerTinta() {
      const e = getComputedStyle(document.documentElement);
      tinta.sinal = (e.getPropertyValue('--sinal') || '#FFC72C').trim();
      tinta.rua = (e.getPropertyValue('--borda') || '#D7D0C6').trim();
    }

    function medir() {
      const r = hero!.getBoundingClientRect();
      larg = Math.max(1, Math.round(r.width));
      alt = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      tela!.width = Math.round(larg * dpr);
      tela!.height = Math.round(alt * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const palco = palcoRef.current;
      if (palco) {
        const p = palco.getBoundingClientRect();
        destino.x = p.left - r.left + p.width / 2;
        destino.y = p.top - r.top + p.height / 2;
      } else {
        destino.x = larg * 0.7;
        destino.y = alt * 0.5;
      }

      const texto = textoRef.current;
      zonaTexto = texto
        ? (() => {
            const t = texto.getBoundingClientRect();
            return { x: t.left - r.left, y: t.top - r.top, w: t.width, h: t.height };
          })()
        : null;

      rotas = Array.from({ length: QUANTAS }, (_, i) =>
        novaRota(larg, alt, destino, -i * 0.9 - Math.random()),
      );
      aneis = [];
    }

    /**
     * Apaga o que foi desenhado por cima da coluna de texto.
     *
     * `destination-out` remove pixels já pintados em vez de cobri-los — então
     * o buraco é de verdade, e não uma mancha da cor do fundo por cima (que
     * apareceria como um retângulo assim que o tema mudasse).
     *
     * É EXATO, ao contrário de uma máscara em CSS: aquela é uma forma fixa
     * tentando adivinhar onde o texto está, e erra a cada mudança de largura,
     * de tamanho de fonte ou de quebra de linha. Aqui a área é lida do próprio
     * elemento e remedida junto com o resto.
     *
     * A borda é suave porque um corte reto seria tão visível quanto a linha
     * que ele apaga. O degradê é radial e a elipse é obtida escalando o eixo
     * X — mais barato que um `filter: blur`, que rasterizaria a cada quadro.
     */
    function apagarSobreTexto() {
      if (!zonaTexto) return;
      const { x, y, w, h } = zonaTexto;
      const margem = 26;
      const rx = w / 2 + margem;
      const ry = h / 2 + margem;

      ctx!.save();
      ctx!.globalCompositeOperation = 'destination-out';
      ctx!.translate(x + w / 2, y + h / 2);
      ctx!.scale(rx / ry, 1);
      const g = ctx!.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.68, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(0, 0, ry, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function desenhar() {
      ctx!.clearRect(0, 0, larg, alt);
      ctx!.lineCap = 'round';
      ctx!.lineJoin = 'round';

      // As ruas — um caminho só para todas, um stroke só.
      ctx!.globalAlpha = 0.55;
      ctx!.strokeStyle = tinta.rua;
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      for (const r of rotas) {
        ctx!.moveTo(r.pts[0].x, r.pts[0].y);
        for (let j = 1; j < r.pts.length; j++) ctx!.lineTo(r.pts[j].x, r.pts[j].y);
      }
      ctx!.stroke();

      // O rastro e a encomenda.
      ctx!.strokeStyle = tinta.sinal;
      ctx!.fillStyle = tinta.sinal;
      for (const r of rotas) {
        if (r.espera > 0 || r.t <= 0) continue;
        for (let n = 0; n < PONTOS_RASTRO; n++) {
          const p1 = r.t - COMP_RASTRO * (n / PONTOS_RASTRO);
          const p2 = r.t - COMP_RASTRO * ((n + 1) / PONTOS_RASTRO);
          if (p2 < 0) break;
          const a = pontoEm(r, p1), b = pontoEm(r, p2);
          ctx!.globalAlpha = (1 - n / PONTOS_RASTRO) * 0.5;
          ctx!.lineWidth = 2;
          ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); ctx!.stroke();
        }
        const c = pontoEm(r, r.t);
        ctx!.globalAlpha = 0.9;
        ctx!.beginPath(); ctx!.arc(c.x, c.y, 2.6, 0, Math.PI * 2); ctx!.fill();
      }

      // O anel de chegada, no endereço.
      ctx!.lineWidth = 1.5;
      for (const an of aneis) {
        ctx!.globalAlpha = Math.max(0, 1 - an.t) * 0.45;
        ctx!.beginPath();
        ctx!.arc(destino.x, destino.y, 14 + an.t * 110, 0, Math.PI * 2);
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
      // Por último: só faz sentido apagar depois de tudo estar desenhado.
      apagarSobreTexto();
    }

    function quadro(agora: number) {
      const dt = Math.min(0.05, (agora - ultimo) / 1000 || 0);
      ultimo = agora;
      rotas.forEach((r, i) => {
        if (r.espera > 0) { r.espera -= dt; return; }
        r.t += r.vel * dt;
        if (r.t >= 1) {
          if (aneis.length < 4) aneis.push({ t: 0 });
          rotas[i] = novaRota(larg, alt, destino, 0.3 + Math.random() * 1.6);
        }
      });
      for (let i = aneis.length - 1; i >= 0; i--) {
        aneis[i].t += dt * 0.75;
        if (aneis[i].t >= 1) aneis.splice(i, 1);
      }
      desenhar();
      pedido = requestAnimationFrame(quadro);
    }

    lerTinta();
    medir();

    // As cores vêm dos tokens: ao trocar o tema, precisam ser relidas.
    const obs = new MutationObserver(() => { lerTinta(); if (!pedido) desenhar(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let remedir: number;
    const aoRedimensionar = () => {
      clearTimeout(remedir);
      remedir = window.setTimeout(() => { medir(); if (!pedido) desenhar(); }, 150);
    };
    window.addEventListener('resize', aoRedimensionar);

    if (reduzido) {
      // Sem movimento: um quadro só, com as entregas paradas no caminho.
      rotas.forEach((r, i) => { r.espera = 0; r.t = 0.35 + i * 0.05; });
      desenhar();
    } else if (ativo) {
      ultimo = performance.now();
      pedido = requestAnimationFrame(quadro);
    } else {
      desenhar();
    }

    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      clearTimeout(remedir);
      obs.disconnect();
      window.removeEventListener('resize', aoRedimensionar);
    };
  }, [palcoRef, textoRef, ativo, reduzido]);

  return <canvas className="rotas" ref={telaRef} aria-hidden="true" />;
}
