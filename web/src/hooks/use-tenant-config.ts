import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  AuthenticatedUser,
  clearTenantAtivo,
  getTenantAtivo,
  getUser,
  setTenantAtivo,
  setUser,
} from '@/api/client';
import type { TenantConfig } from '@/api/types';

/** Módulos opcionais, ligados pelo superadmin na tela do condomínio. */
export type TenantModule = 'vagas' | 'avisos';

const MODULE_KEY: Record<TenantModule, keyof TenantConfig> = {
  vagas: 'moduloVagas',
  avisos: 'moduloAvisos',
};

export const AUTH_ME_KEY = ['auth-me'] as const;

/**
 * Usuário logado + config do condomínio, com uma única request compartilhada
 * (`/auth/me`) para toda a árvore. O valor salvo no localStorage entra como
 * placeholder para a primeira renderização não piscar, e é atualizado quando a
 * resposta chega — é assim que ligar/desligar um módulo no superadmin aparece
 * aqui sem precisar de novo login.
 */
export function useAuthMe() {
  const armazenado = getUser() ?? undefined;
  // O condomínio ativo entra na chave: trocar de condomínio precisa buscar a
  // config do novo, não reaproveitar a do anterior.
  const tenantAtivo = getTenantAtivo();

  const query = useQuery({
    queryKey: [...AUTH_ME_KEY, tenantAtivo],
    queryFn: () => api.get<AuthenticatedUser>('/auth/me'),
    placeholderData: armazenado,
    staleTime: 60_000,
  });

  // Mantém o localStorage em sincronia (usado no boot, antes do React montar).
  useEffect(() => {
    if (query.data && !query.isPlaceholderData) setUser(query.data);
  }, [query.data, query.isPlaceholderData]);

  return query;
}

export function useTenantConfig(): TenantConfig {
  const { data } = useAuthMe();
  return data?.config ?? {};
}

/**
 * Em qual condomínio a sessão está operando.
 *
 * Para síndico e porteiro é sempre o dele. Para a administradora é o que ela
 * escolheu na carteira — e, enquanto não escolher, é `null`: nesse estado as
 * telas de condomínio não têm o que mostrar.
 */
export function useCondominioAtivo(): { id: string | null; nome: string | null } {
  const { data } = useAuthMe();
  if (data?.role === 'admin') {
    return {
      id: data.tenantAtivo?.id ?? getTenantAtivo(),
      nome: data.tenantAtivo?.nome ?? null,
    };
  }
  return { id: data?.tenantId ?? null, nome: data?.tenantNome ?? null };
}

/**
 * Troca o condomínio ativo da administradora.
 *
 * Limpa o cache inteiro de propósito: os dados em memória são do condomínio
 * anterior, e mostrar encomenda de um condomínio sob o nome de outro seria pior
 * do que um instante de carregamento.
 */
export function useTrocarCondominio() {
  const queryClient = useQueryClient();

  return (tenantId: string | null) => {
    if (tenantId) setTenantAtivo(tenantId);
    else clearTenantAtivo();
    queryClient.clear();
  };
}

/**
 * Se o módulo está habilitado para o condomínio.
 *
 * Enquanto a config não chegou (usuário sem `config` no localStorage), devolve
 * `undefined` — quem consome deve tratar como "ainda não sei" e não como
 * "desabilitado", senão o item do menu pisca.
 */
export function useModuleEnabled(modulo: TenantModule): boolean | undefined {
  const { data, isPending } = useAuthMe();
  const config = data?.config;
  if (!config) return isPending ? undefined : false;
  return config[MODULE_KEY[modulo]] === true;
}

export type ModuleGate = 'permitido' | 'negado' | 'carregando';

/**
 * Decisão de acesso para proteger rota. Diferente do `useModuleEnabled`, nunca
 * NEGA com base no valor provisório do localStorage: logo depois de o superadmin
 * habilitar um módulo, o valor guardado ainda diz `false`, e negar ali jogaria o
 * usuário para a home mesmo tendo acesso. Só nega depois que o `/auth/me`
 * confirmou.
 */
export function useModuleGate(modulo: TenantModule): ModuleGate {
  const { data, isPlaceholderData, isFetching } = useAuthMe();
  const config = data?.config;

  if (config?.[MODULE_KEY[modulo]] === true) return 'permitido';
  if (!config || isPlaceholderData || isFetching) return 'carregando';
  return 'negado';
}
