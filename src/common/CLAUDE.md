# Common — o que segura o multitenant

Aqui moram os guards, decorators e serviços que valem para **todas** as rotas.
Mexer neste diretório é mexer no isolamento entre condomínios de uma vez só:
qualquer alteração pede `npm run test:e2e`.

## Guards globais (ordem importa)

Registrados no `AppModule` nesta ordem — é ela que garante que cada um encontre
o que o anterior deixou pronto:

1. **`JwtAuthGuard`** — autentica e preenche `req.user`. `@Public()` pula.
2. **`RolesGuard`** — confere `@Roles(...)`. Rota sem `@Roles` aceita qualquer
   usuário logado.
3. **`TenantScopeGuard`** — resolve e valida o condomínio da request, gravando em
   `req.tenantScope`.
4. **`TenantModuleGuard`** — bloqueia módulo opcional (`@RequiresModule`) que o
   condomínio não contratou. Lê o escopo do passo 3.
5. **`ThrottlerGuard`** — limite de requisições.

## Escopo do condomínio (`tenant-scope/`)

`TenantScopeService.resolver()` decide, por papel:

| Papel | Regra |
|---|---|
| `sindico` / `porteiro` | Vale o vínculo do usuário. Header pedindo outro condomínio → **403** |
| `admin` | Header `X-Tenant-Id` validado contra a carteira. Fora dela, inexistente ou desativado → **403** com a mesma mensagem (não vaza existência) |
| `superadmin` | Qualquer condomínio existente |

Cache de 30s por condomínio; `invalidate(tenantId)` quando o vínculo ou o `ativo`
muda.

> **Nenhum controller lê `X-Tenant-Id`.** Rotas usam `@TenantId()` (exige
> condomínio) ou `@TenantScope()` (aceita `null`). Ler o header em outro lugar
> cria um caminho que não passa por esta validação.

`tenant-ref.ts` traz `assertRefDoTenant()`: use para **todo** campo
`algumaCoisaId` que chega no corpo da request.

## Decorators (`decorators/`)

| Decorator | Devolve / faz |
|---|---|
| `@Public()` | Libera a rota do JWT |
| `@Roles(...)` | Perfis que podem acessar |
| `@RequiresModule('vagas' \| 'avisos')` | Exige módulo contratado |
| `@CurrentUser()` | Usuário autenticado |
| `@TenantId()` | Condomínio da request (403 se não houver) |
| `@TenantScope()` | Condomínio da request ou `null` |
| `@AdministradoraId()` | Carteira do usuário logado |

## Config do condomínio (`tenant-config/`)

`TenantConfigService` lê `tenants.config_json` com cache curto. Guarda os módulos
contratados (`moduloVagas`, `moduloAvisos`), o tipo do condomínio, a estrutura de
blocos e os parâmetros anti-bloqueio do WhatsApp. `invalidate()` é chamado quando
o superadmin salva a configuração, para o efeito ser imediato.

## Auditoria (`audit/`, `interceptors/`)

`AuditInterceptor` registra POST/PUT/PATCH/DELETE em `audit_log`, sanitizando
`senha`/`password`. O `tenant_id` gravado é o **escopo da request** — para a
administradora, o condomínio em que ela estava operando, não o vínculo (nulo) do
usuário.

## Ao alterar este diretório

- [ ] Mudou ordem ou lógica de guard → `npm run test:e2e` **obrigatório**.
- [ ] Papel novo → atualize `UserRole`, o CHECK `chk_users_escopo` (migration),
      `TenantScopeService.resolver()` e a tabela de perfis do `CLAUDE.md` raiz.
- [ ] Decorator novo → exporte em `decorators/index.ts` e registre na tabela de
      peças reutilizáveis do `CLAUDE.md` raiz.
