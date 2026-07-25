# Módulo: Usuários (logins do condomínio)

Gerencia quem entra no painel **de um condomínio**: síndico e porteiro. Acesso de
administradora e superadmin não passa por aqui.

## Rotas e perfis

| Rota | admin | sindico |
|---|:---:|:---:|
| `GET /usuarios`, `GET /usuarios/:id` | ✅ | ✅ |
| `POST /usuarios` | ✅ | ✅ |
| `PATCH /usuarios/:id` | ✅ | ✅ |
| `DELETE /usuarios/:id` (desativa) | ✅ | ✅ |

A administradora usa estas rotas **com o condomínio escolhido** no header — é
assim que ela cadastra o síndico de um condomínio da carteira dela.

## Regras de negócio

1. **Só `porteiro` e `sindico` podem ser criados aqui**
   (`ROLES_GERENCIAVEIS_PELO_TENANT`). `admin` e `superadmin` não pertencem a um
   condomínio — o banco recusa (`chk_users_escopo`) e o DTO nem aceita o valor.
   É o ponto onde uma escalada de privilégio seria mais natural; por isso a lista
   é fechada e há teste e2e cobrindo.
2. **O condomínio precisa ter ao menos um síndico ativo.** Rebaixar, desativar ou
   remover o último devolve 400 — senão o condomínio fica sem quem administre.
3. **E-mail único por condomínio** (índice parcial); conflito vira 409.
4. **`senhaHash` nunca sai da API** (`select: false` na entidade).
5. Remoção é desativação.

## Onde mais se cria usuário

| Caminho | Cria | Quem usa |
|---|---|---|
| `POST /usuarios` | síndico, porteiro | síndico e administradora (com condomínio escolhido) |
| `POST /admin/tenants/:id/usuarios` | síndico, porteiro | superadmin, suporte |
| `POST /admin/administradoras/:id/usuarios` | **admin** (papel fixo) | superadmin |

Nenhum caminho cria `superadmin` — isso é feito pelo seed.

## Ao alterar este módulo

- [ ] Mexeu na lista de papéis criáveis? Ajuste `ROLES_GERENCIAVEIS`,
      `ROLES_GERENCIAVEIS_PELO_TENANT`, `ROLES_SUPERADMIN` (módulo Admin) e o
      teste de escalada em `test/multitenant.e2e-spec.ts`.
- [ ] Papel novo → o CHECK `chk_users_escopo` precisa de migration.
