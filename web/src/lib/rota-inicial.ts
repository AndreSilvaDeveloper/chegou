import { getUser, type AuthenticatedUser } from '@/api/client';

/**
 * A primeira tela de cada perfil.
 *
 * **Um mapa só, num arquivo só.** O destino era decidido em quatro lugares — o
 * `nav()` depois do login, a guarda de "já está logado" do `Login`, a rota `/` e
 * o catch-all `*` — e três deles mandavam todo mundo para `/encomendas`. O
 * superadmin caía numa tela de condomínio que ele nem opera, e a administradora
 * numa tela que exige um condomínio escolhido.
 *
 * O critério é "a tela que responde à primeira pergunta do dia":
 *
 * | Perfil | Cai em | Porque |
 * |---|---|---|
 * | `porteiro` | `/encomendas` | Ele está em pé na portaria com um pacote na mão |
 * | `sindico` | `/dashboard` | Ele quer o resumo do condomínio, não a fila |
 * | `admin` | `/meus-condominios` | Ele ainda não está DENTRO de nenhum condomínio |
 * | `superadmin` | `/admin` | O trabalho dele é a plataforma, não um condomínio |
 */
export const ROTA_INICIAL: Record<AuthenticatedUser['role'], string> = {
  superadmin: '/admin',
  admin: '/meus-condominios',
  sindico: '/dashboard',
  porteiro: '/encomendas',
};

/**
 * Para onde mandar este usuário.
 *
 * Sem usuário devolve `/encomendas`, que é rota protegida: o `ProtectedRoute`
 * devolve para o login. Mandar direto para `/login` aqui seria pior — quem tem
 * sessão válida veria a tela de login piscar antes de chegar ao destino.
 *
 * O argumento existe para o login passar o usuário que **acabou** de chegar na
 * resposta, sem depender de o `setUser` já ter ido para o localStorage.
 */
export function rotaInicial(user: AuthenticatedUser | null = getUser()): string {
  return (user && ROTA_INICIAL[user.role]) || '/encomendas';
}
