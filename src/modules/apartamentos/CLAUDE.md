# Módulo: Apartamentos

As unidades do condomínio. Base de quase tudo: encomenda chega para um
apartamento, morador mora em um, vaga pode pertencer a um.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /apartamentos` (busca por `q`) | ✅ | ✅ | ✅ |
| `GET /apartamentos/blocos` | ✅ | ✅ | ✅ |
| `GET /apartamentos/lookup` | ✅ | ✅ | ✅ |
| `GET /apartamentos/:id`, `/:id/moradores` | ✅ | ✅ | ✅ |
| `POST /apartamentos` | ✅ | ✅ | ✅ |
| `PATCH /apartamentos/:id` | ✅ | ✅ | — |
| `DELETE /apartamentos/:id` (desativa) | ✅ | ✅ | — |
| `POST /apartamentos/import` (CSV) | ✅ | ✅ | — |
| `POST /apartamentos/disparar-cobranca` | ✅ | ✅ | — |

> O porteiro **cria** apartamento porque na portaria aparece unidade nova antes
> de o síndico cadastrar. Editar e remover continuam com a gestão. Se isso não
> for o desejado, é um `@Roles` para revisar.

## Dados

`apartamentos` (`tenant_id NOT NULL`): `bloco` (opcional), `numero`,
`identificador` (derivado: `A-101` ou `101`), `valor_condominio`, `observacoes`,
`ativo`.

Unicidade por `(tenant_id, bloco, numero)` — bloco vazio conta como `''`.

## Regras de negócio

1. **Bloco + número é único no condomínio.** Conflito devolve 409 com mensagem
   explícita, não erro genérico do banco.
2. **Remoção é desativação** (`ativo = false`): apagar apartamento levaria junto
   histórico de encomendas.
3. **Importação por CSV** processa linha a linha e devolve os erros com o número
   da linha, sem abortar o lote inteiro.
4. O condomínio pode ser "bloco único" ou "múltiplos blocos"
   (`config_json.estruturaBlocos`) — o frontend usa isso para mostrar ou esconder
   o campo bloco.

## Frontend

`web/src/pages/Apartamentos.tsx` + `components/ApartamentosManager.tsx`
(reaproveitado pela tela do superadmin) e `components/ImportDialog.tsx`.

## Ao alterar este módulo

- [ ] Mudou `identificador`? Ele aparece em encomendas, moradores e vagas —
      confira as telas que exibem.
- [ ] Campo novo → veja se entra na importação CSV e no `ApartamentosManager`.
- [ ] Mexeu na unicidade → ajuste a migration e a tradução do erro 409.
