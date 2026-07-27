import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { MinhaAssinatura } from '@/api/types';
import { useAuthMe } from '@/hooks/use-tenant-config';

/**
 * A assinatura do cliente logado — a mesma query para a tela e para o menu.
 *
 * A chave inclui o perfil porque o endpoint muda com ele: a administradora
 * pergunta pela carteira, o síndico pelo condomínio. Sendo a mesma query, o
 * aviso do menu e a tela nunca discordam, e abrir `/assinatura` não dispara uma
 * segunda busca.
 *
 * Fica desligada para superadmin e porteiro: nenhum dos dois tem conta a pagar,
 * e os endpoints responderiam 403.
 */
export function useMinhaAssinatura() {
  const { data: me } = useAuthMe();
  const ehAdministradora = me?.role === 'admin';
  const temConta = ehAdministradora || me?.role === 'sindico';

  return useQuery({
    queryKey: ['minha-assinatura', ehAdministradora ? 'carteira' : 'condominio'],
    queryFn: () =>
      api.get<MinhaAssinatura>(
        ehAdministradora ? '/minha-administradora/assinatura' : '/assinatura',
      ),
    enabled: temConta,
    // O vencimento muda de dia em dia, não de minuto em minuto: sem isso, cada
    // navegação pelo menu refaria a consulta só para redesenhar o mesmo ponto.
    staleTime: 5 * 60_000,
  });
}
