---
name: funcionalidade-nova
description: Fluxo padrão do Chegou para implementar qualquer funcionalidade nova — começa perguntando quais perfis de acesso podem usá-la, aplica o acesso no back e no front, cuida do isolamento por condomínio e fecha atualizando a documentação do módulo. Use ao criar tela, rota, campo ou regra nova.
---

# Funcionalidade nova no Chegou

Este é o passo a passo obrigatório. Ele existe porque três coisas somem quando
se implementa direto: **quem pode ver**, **o isolamento entre condomínios** e a
**documentação do módulo**.

## 1. Pergunte os perfis ANTES de escrever código

Não presuma. Faça a pergunta ao usuário com opções concretas, cobrindo:

1. **Quais perfis** — `superadmin`, `admin` (administradora), `sindico`,
   `porteiro`. Separe leitura de escrita quando fizer diferença (é comum o
   porteiro consultar mas não editar).
2. **É módulo opcional?** Como Vagas e Avisos, que o superadmin liga por
   condomínio (`config_json` + `@RequiresModule`), ou vale para todos?
3. **É do condomínio ou da carteira?** Funcionalidade de condomínio exige
   `X-Tenant-Id` (a administradora precisa ter entrado em um condomínio);
   funcionalidade de carteira mora em `/minha-administradora/...`.

Se o usuário já respondeu isso na conversa, siga — não pergunte de novo.

## 2. Backend

- Rota com `@Roles(...)` exatamente com os perfis combinados. Sem `@Roles`, a
  rota fica liberada para qualquer usuário logado — quase nunca é o desejado.
- Módulo opcional: `@RequiresModule('vagas' | 'avisos')` no controller.
- Condomínio **sempre** por `@TenantId()`. Nunca leia `X-Tenant-Id` na rota.
- DTO com `class-validator`. Todo campo `algumaCoisaId` no corpo passa por
  `assertRefDoTenant()` (`src/common/tenant-scope/tenant-ref.ts`).
- Em `repo.create({...})`, o `tenantId` vem **depois** do spread do DTO.
- Query nova: `where` com `tenantId` — inclusive nos `findOne(id)`.
- Alteração de schema: migration SQL em `db/migrations/` (nunca `synchronize`).

## 3. Frontend

- Rota em `web/src/App.tsx` com `<ProtectedRoute allowedRoles={[...]}>` e
  `requiresModule` quando for módulo opcional.
- Item de menu em `NAV_ITEMS` (`web/src/components/Layout.tsx`) com os mesmos
  `roles` — menu e rota precisam concordar.
- Tela seguindo os padrões: mobile-first, `Skeleton` no carregamento,
  `EmptyState` no vazio, `FormDialog` para formulário, `ConfirmDialog` para ação
  destrutiva, botões com `min-h-[48px]`, ícone sempre com texto.
- Erro de request: `toast.error(mensagemErro(err, 'Não foi possível ...'))`.

## 4. Verifique

```bash
npx tsc --noEmit -p tsconfig.json          # backend
cd web && npx tsc --noEmit -p tsconfig.json # frontend
npm run test:e2e                            # obrigatório se mexeu em acesso/rota
```

Mexeu em guard, papel ou escopo? Acrescente o caso em
`test/multitenant.e2e-spec.ts` — é a rede que garante que um condomínio não vê
o outro.

## 5. Documente (não é opcional)

- `CLAUDE.md` do módulo: rotas + perfis, campos novos, regra nova **com o
  porquê**, armadilha que você descobriu.
- `CLAUDE.md` raiz: tabela "O que cada perfil faz", se o acesso mudou.
- Trecho que você copiou de outro arquivo? Extraia e registre em "Peças
  reutilizáveis".

## Erros que este fluxo evita

- Rota nova que o porteiro acessa sem querer (esqueceram o `@Roles`).
- Menu mostrando tela que a API recusa (roles do menu ≠ roles da rota).
- `apartamentoId` de outro condomínio aceito no corpo.
- Módulo opcional aparecendo para condomínio que não contratou.
- Doc do módulo mentindo seis meses depois.
