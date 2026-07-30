/**
 * "Lembrar meus dados" da tela de login.
 *
 * Guarda e-mail e senha no `localStorage` do aparelho para o porteiro não
 * digitar tudo de novo a cada turno. Duas coisas para ter em mente antes de
 * mexer aqui:
 *
 * - **A senha fica em texto puro.** `localStorage` não tem cofre; embaralhar o
 *   valor só disfarçaria (quem abre o DevTools desfaz em um passo) e daria uma
 *   falsa sensação de proteção. Quem marcar a caixa está dizendo "este aparelho
 *   é meu" — por isso a caixa vem **desmarcada** e a tela avisa o que ela faz.
 * - **Sair do sistema não apaga isso.** É o ponto da funcionalidade: o
 *   `clearToken()` derruba a sessão, e no próximo login os campos ainda vêm
 *   preenchidos. Quem quer esquecer desmarca a caixa e entra uma vez.
 */

const LEMBRAR_KEY = 'portaria.lembrarLogin';

export interface LoginLembrado {
  email: string;
  senha: string;
}

export function getLoginLembrado(): LoginLembrado | null {
  try {
    const raw = localStorage.getItem(LEMBRAR_KEY);
    if (!raw) return null;
    const dados = JSON.parse(raw) as Partial<LoginLembrado>;
    if (typeof dados?.email !== 'string' || typeof dados?.senha !== 'string') return null;
    return { email: dados.email, senha: dados.senha };
  } catch {
    // JSON estragado por versão antiga: melhor a tela abrir vazia do que quebrar.
    return null;
  }
}

export function setLoginLembrado(dados: LoginLembrado): void {
  localStorage.setItem(LEMBRAR_KEY, JSON.stringify(dados));
}

export function clearLoginLembrado(): void {
  localStorage.removeItem(LEMBRAR_KEY);
}
