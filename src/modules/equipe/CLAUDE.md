# Módulo: Equipe (funcionários)

Cadastro dos funcionários do condomínio — zelador, faxineiro, jardineiro,
porteiro. **Funcionário não é usuário**: ele não acessa o sistema, a não ser que
tenha um login vinculado.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /equipe`, `GET /equipe/:id` | ✅ | ✅ | — |
| `POST /equipe` | ✅ | ✅ | — |
| `PATCH /equipe/:id` | ✅ | ✅ | — |
| `DELETE /equipe/:id` (desativa) | ✅ | ✅ | — |

## Dados

`funcionarios` (`tenant_id NOT NULL`): `nome`, `cargo`, `telefone`, `email`,
`documento`, `data_admissao`, `horario_trabalho`, `observacoes`, `ativo` e
`user_id` (opcional).

## Regras de negócio

1. **`user_id` precisa ser um login do mesmo condomínio.** A listagem carrega a
   relação, então um id de fora vazaria nome e e-mail de usuário de outro
   condomínio — foi um furo real, hoje coberto por
   `assertRefDoTenant()` e por teste e2e.
2. **`Object.assign(func, dto)` reafirma o `tenantId`** logo depois: o update é
   genérico, e campo novo no DTO não pode virar troca de dono do registro.
3. Campos anuláveis aceitam `null` explícito (limpar telefone, e-mail, etc.).
4. Remoção é desativação.

## Frontend

`web/src/pages/Equipe.tsx` + `components/EquipeManager.tsx`.

## Ao alterar este módulo

- [ ] Campo novo no DTO → confirme que o `Object.assign` não abre porta para
      sobrescrever `tenantId` ou `id`.
- [ ] Referência nova para outra entidade → `assertRefDoTenant()`.
