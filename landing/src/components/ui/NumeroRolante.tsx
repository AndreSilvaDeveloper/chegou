import type { ReactElement } from 'react';
import { vars } from '@/lib/css';
import './NumeroRolante.css';

/** Quantas voltas completas a fita dá antes de assentar no dígito. */
const VOLTAS = 2;
const DIGITOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * O número que rola até o lugar, como contador mecânico.
 *
 * Cada dígito é uma FITA vertical de 0 a 9 repetida, e o que se move é a fita
 * inteira — um `translateY` só. Não há contagem em JavaScript, nem número
 * sendo reescrito no DOM a cada quadro: o navegador interpola a posição da
 * fita e o dígito certo aparece na janela.
 *
 * Por isso o efeito funciona no "0", onde uma contagem de 0 até 0 não teria o
 * que mostrar. Aqui o zero também dá as duas voltas e assenta.
 *
 * Caractere que não é dígito (o "s" de "20s") fica parado: só o que é número
 * roda, senão a letra viraria um sorteio de tipos.
 */
export function NumeroRolante({
  valor,
  ativo,
}: {
  valor: string;
  /** Dispara a rolagem. Vem de quando a seção entra na tela. */
  ativo: boolean;
}): ReactElement {
  return (
    <span className="rolo" data-rodou={ativo ? 'sim' : 'nao'} aria-label={valor}>
      {[...valor].map((ch, i) => {
        const digito = Number(ch);
        if (Number.isNaN(digito)) {
          return (
            <span className="rolo__fixo" key={i} aria-hidden="true">
              {ch}
            </span>
          );
        }
        return (
          <span className="rolo__janela" key={i} aria-hidden="true">
            <span
              className="rolo__fita"
              style={vars({
                '--alvo': VOLTAS * DIGITOS.length + digito,
                // Cada dígito parte um pouco depois do anterior: é o que faz
                // ler como mecanismo em vez de bloco único.
                '--atraso': `${i * 90}ms`,
              })}
            >
              {Array.from({ length: VOLTAS + 1 }, () => DIGITOS)
                .flat()
                .map((d, n) => (
                  <span key={n}>{d}</span>
                ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
