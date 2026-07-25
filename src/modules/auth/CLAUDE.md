# Módulo: Auth

Login, tokens e a resposta que diz ao frontend quem é o usuário, em qual
condomínio ele está e o que aquele condomínio contratou.

## Rotas e perfis

| Rota | Acesso |
|---|---|
| `POST /auth/login` | `@Public()` |
| `POST /auth/refresh` | `@Public()` |
| `GET /auth/me` | Qualquer usuário autenticado |

## O que `/auth/me` devolve

```ts
{
  id, nome, email, role,
  tenantId, tenantNome,               // vínculo fixo (síndico, porteiro)
  administradoraId, administradoraNome, // carteira (administradora)
  tenantAtivo: { id, nome } | null,   // condomínio da request
  config: { moduloVagas, moduloAvisos, tipo, estruturaBlocos, ... }
}
```

`config` e `tenantAtivo` seguem o **escopo da request**: quando a administradora
troca de condomínio, o `/auth/me` responde com a config do novo — é assim que o
menu se ajusta sem novo login.

## Regras de negócio

1. **JWT global**: `JwtAuthGuard` é `APP_GUARD`; rota pública precisa de
   `@Public()` explícito.
2. **O usuário é recarregado do banco a cada request** (`JwtStrategy.validate`).
   Desativar alguém ou tirá-lo da carteira vale na hora, sem esperar o token
   expirar.
3. **Login já devolve a config** para o front montar o menu sem uma segunda
   chamada. Para a administradora ela vem vazia — ela ainda não escolheu
   condomínio.
4. **Credencial inválida é sempre "Credenciais inválidas"**, sem dizer se o
   e-mail existe.
5. Refresh token dura 7 dias e é validado pelo campo `type`.

## Frontend

`web/src/pages/Login.tsx` (redireciona por papel: superadmin → `/admin`,
administradora → `/meus-condominios`, demais → `/`) e
`web/src/hooks/use-tenant-config.ts` (`useAuthMe`, uma query compartilhada por
toda a árvore).

## Ao alterar este módulo

- [ ] Campo novo em `AuthenticatedUser` → atualize `types.ts`, `JwtStrategy`,
      `generateTokens`, o `AuthenticatedUser` do frontend (`web/src/api/client.ts`)
      e esta doc.
- [ ] Mexeu no que `/auth/me` devolve → confira `Layout` e `ProtectedRoute`, que
      dependem de `config` e `tenantAtivo`.
