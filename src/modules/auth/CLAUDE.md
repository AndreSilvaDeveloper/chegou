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

### "Lembrar meus dados"

A caixa na tela de login guarda **e-mail e senha** no `localStorage` do aparelho
(`web/src/lib/lembrar-login.ts`) para o porteiro não redigitar tudo a cada turno
no celular da portaria. Três decisões que não são detalhe:

- **A senha fica em texto puro.** `localStorage` não é cofre; embaralhar o valor
  só disfarçaria e daria falsa sensação de segurança. Por isso a caixa nasce
  desmarcada e a própria tela diz "só marque se ele for seu" — é uma escolha
  informada de quem usa, não um padrão silencioso.
- **Só grava depois do 200.** Salvar antes guardaria a senha errada de quem
  errou a digitação, e ela voltaria pronta para errar de novo no dia seguinte.
- **Sair do sistema não apaga.** `clearToken()` derruba a sessão e mantém o que
  foi lembrado — é o ponto da funcionalidade. Quem quer esquecer desmarca a
  caixa, e o apagamento é imediato (não espera um login novo).

Se um dia isso incomodar em portaria com aparelho compartilhado, o corte menor é
lembrar só o e-mail: `setLoginLembrado({ email, senha: '' })`.

## Ao alterar este módulo

- [ ] Campo novo em `AuthenticatedUser` → atualize `types.ts`, `JwtStrategy`,
      `generateTokens`, o `AuthenticatedUser` do frontend (`web/src/api/client.ts`)
      e esta doc.
- [ ] Mexeu no que `/auth/me` devolve → confira `Layout` e `ProtectedRoute`, que
      dependem de `config` e `tenantAtivo`.
