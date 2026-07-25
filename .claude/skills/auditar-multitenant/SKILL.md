---
name: auditar-multitenant
description: Audita o isolamento entre condomínios do Chegou — procura query sem filtro de tenant, id de outro condomínio aceito no corpo, rota sem perfil e escapes do escopo por request. Use depois de mexer em service, guard, DTO ou rota, e periodicamente como revisão de segurança.
---

# Auditoria de isolamento entre condomínios

Um vazamento aqui significa um condomínio vendo dado do outro. A auditoria é
mecânica: cinco varreduras e uma prova.

## 1. Query sem filtro de condomínio

```bash
grep -rn "findOne\|findOneBy\|find(\|count(\|exists(" src/modules --include=*.service.ts -A 3 | grep -i where
```

Toda busca por id de dado de condomínio precisa de `tenantId` **junto** com o
`id`. Buscar só por `id` e conferir o tenant depois já é vazamento quando a
resposta é um 404 diferente de um 403.

Exceções legítimas: `admin/`, `administradoras/` (plataforma) e jobs internos que
recebem o tenant no payload.

## 2. Id de outro condomínio aceito no corpo

```bash
grep -rn "Id\?:" src/modules/*/dto/*.ts | grep -i uuid
```

Para cada campo `algumaCoisaId` de DTO, confirme que o service chama
`assertRefDoTenant()` antes de gravar. É o furo mais comum: a rota está isolada,
mas o corpo carrega o id de um registro alheio — e a listagem que traz a relação
devolve o dado do outro condomínio.

## 3. `tenantId` sobrescrito pelo corpo

```bash
grep -rn "\.\.\.dto" src/modules --include=*.service.ts
```

Em `create({ ...dto, tenantId })` o `tenantId` tem que vir **depois** do spread.
`Object.assign(entidade, dto)` exige reafirmar `entidade.tenantId = tenantId`.

## 4. Rota sem perfil

```bash
grep -rn "@Get\|@Post\|@Patch\|@Put\|@Delete\|@Roles" src/modules --include=*.controller.ts
```

Rota sem `@Roles` (na classe ou no método) aceita qualquer usuário logado.
Confira também se o menu do frontend usa os mesmos perfis da rota.

## 5. Escape do escopo por request

```bash
grep -rn "x-tenant-id\|X-Tenant-Id\|headers\[" src --include=*.ts
```

Só o `TenantScopeGuard` pode ler esse header. Qualquer outro lugar é um caminho
paralelo que não passa pela validação da carteira.

## 6. A prova

```bash
npm run test:e2e
```

`test/multitenant.e2e-spec.ts` monta duas administradoras e três condomínios e
tenta atravessar as fronteiras por todos os ângulos. Achou um furo novo?
**Escreva o teste que o pega antes de corrigir** — assim ele não volta.

## O que já foi encontrado por aqui (não repita)

- `equipe`: `userId` de outro condomínio vazava nome e e-mail na listagem.
- `avisos`: `apartamentoId` alheio virava aviso enviado para ninguém, sem erro.
- `whatsapp`: telefone em dois condomínios era resolvido por "o primeiro do
  banco" — podia dar baixa em encomenda do condomínio errado.
