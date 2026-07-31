import { useEffect, type RefObject } from 'react';

/** Quanto do cartão anterior fica à mostra acima do que chega, em px. */
const SOBRA = 26;
/** O quanto cada cartão encolhe a cada novo que entra na frente dele. */
const RECUO = 0.045;
/** Fração da altura do palco de onde o cartão sobe. */
const ENTRADA = 0.85;
/**
 * O quanto o cartão que chega precisa ter entrado para ser considerado o da
 * frente. Na metade do caminho ele já cobre o anterior — é o momento em que a
 * evidência troca de dono.
 */
const TROCA = 0.5;

const trava = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A pilha de cartões com a tela travada.
 *
 * O CSS dá a pista alta e o palco `sticky`; este hook converte a rolagem
 * consumida pela pista em posição de cada cartão.
 *
 * COMO O PROGRESSO É REPARTIDO
 * O primeiro cartão já começa em cena — quem chega são os demais. Então o
 * curso é dividido em (N-1) fatias, e a fatia `i` traz o cartão `i+1`.
 * Repartir em N deixaria a seção abrir vazia, esperando o primeiro subir.
 *
 * A POSIÇÃO DE CADA UM tem duas parcelas somadas:
 *   entrada  — o quanto ele já subiu de baixo do palco (0 = fora, 1 = no lugar)
 *   empurrão — a soma contínua das entradas de TODOS os que vêm depois dele
 *
 * O empurrão é o que faz a pilha: cada cartão que chega desloca os anteriores
 * um degrau para cima e os encolhe um pouco. Como ele é somado de forma
 * contínua (e não em degraus inteiros), o movimento acompanha a rolagem em vez
 * de saltar quando um cartão termina de entrar.
 *
 * Só escreve no DOM quando o valor muda de verdade: sem isso seria um
 * recálculo de estilo por cartão por quadro, mesmo com a página parada.
 */
export function usePilha(
  pistaRef: RefObject<HTMLElement | null>,
  ativo: boolean,
  /**
   * Chamado quando MUDA o cartão em evidência — nunca a cada quadro. Avisar
   * por quadro faria o React re-renderizar 60 vezes por segundo para dizer a
   * mesma coisa.
   */
  aoTrocarFrente?: (indice: number) => void,
): void {
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista || !ativo) return;

    const cartoes = Array.from(pista.querySelectorAll<HTMLElement>('.passo'));
    const n = cartoes.length;
    if (!n) return;

    const anterior: string[] = [];
    let frenteAnterior = -1;
    let pedido = 0;

    function quadro() {
      const alturaPalco = window.innerHeight;
      // Curso útil: o quanto a pista rola com o palco preso no topo.
      const curso = Math.max(1, pista!.offsetHeight - alturaPalco);
      const p = trava(-pista!.getBoundingClientRect().top / curso);

      // Quanto de cada fatia já foi percorrido. Fatias = cartões que entram.
      const fatias = Math.max(1, n - 1);
      const avanco = p * fatias;

      // Quem está em evidência: o último que já passou da metade da entrada.
      let frente = 0;
      for (let i = 1; i < n; i++) if (trava(avanco - (i - 1)) >= TROCA) frente = i;
      if (frente !== frenteAnterior) {
        frenteAnterior = frente;
        aoTrocarFrente?.(frente);
      }

      for (let i = 0; i < n; i++) {
        // O cartão 0 já está em cena; o cartão i entra na fatia i-1.
        const entrada = i === 0 ? 1 : trava(avanco - (i - 1));

        let empurrao = 0;
        for (let j = i + 1; j < n; j++) empurrao += trava(avanco - (j - 1));

        const y = (1 - entrada) * alturaPalco * ENTRADA - empurrao * SOBRA;
        const escala = 1 - empurrao * RECUO;

        const t = `translate(-50%, calc(-50% + ${y.toFixed(1)}px)) scale(${escala.toFixed(3)})`;
        if (anterior[i] === t) continue;
        anterior[i] = t;
        cartoes[i].style.transform = t;
        // Antes de começar a subir ele nem é desenhado — evita um cartão
        // parado no rodapé do palco esperando a vez.
        cartoes[i].style.opacity = entrada > 0 ? '1' : '0';
      }

      pedido = requestAnimationFrame(quadro);
    }

    pedido = requestAnimationFrame(quadro);
    return () => {
      cancelAnimationFrame(pedido);
      cartoes.forEach((c) => {
        c.style.transform = '';
        c.style.opacity = '';
      });
    };
  }, [pistaRef, ativo, aoTrocarFrente]);
}
