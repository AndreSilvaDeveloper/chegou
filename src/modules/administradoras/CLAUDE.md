# Módulo: Administradoras

A empresa que administra uma carteira de condomínios. Introduz o papel `admin`
(administradora), que **não pertence a um condomínio** e opera dentro dos
condomínios da carteira escolhendo um por request.

## Rotas e perfis

### Superadmin — `/admin/administradoras`

| Rota | O que faz |
|---|---|
| `GET /` | Lista com contagem de condomínios e acessos |
| `POST /` | Cria a administradora |
| `GET /:id` | Detalhe + carteira + acessos |
| `PATCH /:id` | Dados cadastrais e `ativo` |
| `GET /condominios-sem-carteira` | Condomínios ainda sem administradora |
| `GET/POST /:id/condominios` | Lista / cria condomínio já na carteira |
| `POST /:id/condominios/vincular` | Move condomínio existente para a carteira |
| `DELETE /:id/condominios/:tenantId` | Tira da carteira (não apaga o condomínio) |
| `GET/POST /:id/usuarios`, `DELETE /:id/usuarios/:userId` | Acessos da administradora |

### Administradora — `/minha-administradora`

| Rota | O que faz |
|---|---|
| `GET /` | Dados da própria administradora |
| `GET /condominios` | A carteira |
| `GET /condominios/:tenantId` | Um condomínio da carteira (404 se for de outra) |
| `POST /condominios` | Cria condomínio na própria carteira, com o primeiro síndico |
| `PATCH /condominios/:tenantId` | Dados cadastrais do condomínio |
| `GET /usuarios` | Acessos da própria administradora |

**Nenhuma rota de `/minha-administradora` recebe o id da carteira** — ele vem do
usuário logado (`@AdministradoraId()`). Não existe id para adulterar na URL.

## Dados

- `administradoras`: `nome`, `cnpj` (único quando preenchido), contatos, `ativo`
- `tenants.administradora_id`: NULL = condomínio direto com o superadmin
- `users.administradora_id`: preenchido só para `role = 'admin'`

FKs com `ON DELETE RESTRICT`: apagar administradora com carteira ou acessos é
erro. O caminho é desativar (`ativo = false`), como no resto do sistema.

## Regras de negócio

1. **A carteira é a fronteira.** Todo método que recebe `administradoraId` busca
   amarrando a ela — a administradora não consegue nem confirmar que existe um
   condomínio de outra (404, não 403).
2. **A administradora só edita o cadastral** dos condomínios dela. Plano,
   ativar/desativar e módulos contratados são decisão da plataforma
   (superadmin) — de propósito.
3. **Papel não vem do corpo.** `POST /:id/usuarios` cria sempre `role = 'admin'`;
   é isso que impede a rota de virar atalho para criar superadmin.
4. **Administradora desativada não cria condomínio.**
5. Vincular/desvincular condomínio **invalida o cache do escopo**
   (`TenantScopeService.invalidate`) — sem isso o acesso concedido só valeria
   depois do TTL.

## Frontend

- `web/src/pages/MeusCondominios.tsx` — carteira da administradora; é a tela
  onde ela escolhe em qual condomínio entrar (única rota dela marcada como
  `semCondominio`).
- `web/src/pages/SuperAdminAdministradoras.tsx` — gestão pelo superadmin.
- Trocar de condomínio: `useTrocarCondominio()` em
  `web/src/hooks/use-tenant-config.ts` (limpa o cache do react-query).

## Ao alterar este módulo

- [ ] Rota nova em `/minha-administradora`? O id da carteira vem de
      `@AdministradoraId()`, **nunca** da URL.
- [ ] Mexeu no vínculo condomínio ↔ carteira? Chame
      `TenantScopeService.invalidate(tenantId)`.
- [ ] Ampliou o que a administradora pode fazer? Atualize a tabela de perfis do
      `CLAUDE.md` raiz e acrescente o caso em `test/multitenant.e2e-spec.ts`.
