# Módulo: Moradores

Quem mora no condomínio e, principalmente, **por onde é avisado**. O telefone
daqui é o destino de toda notificação de encomenda, aviso e cobrança.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /moradores` (busca por nome/telefone/documento) | ✅ | ✅ | ✅ |
| `GET /moradores/:id` | ✅ | ✅ | ✅ |
| `POST /moradores` | ✅ | ✅ | — |
| `PATCH /moradores/:id` | ✅ | ✅ | — |
| `DELETE /moradores/:id` (desativa) | ✅ | ✅ | — |
| `POST /moradores/import` (CSV) | ✅ | ✅ | — |

O porteiro consulta para saber a quem entregar; cadastro é da gestão.

## Dados

`moradores` (`tenant_id NOT NULL`): `apartamento_id`, `nome`, `telefone_e164`,
`email`, `documento`, `principal`, `receber_whatsapp`, `ativo`.

## Regras de negócio

1. **Nome, apartamento e telefone são obrigatórios** — no formulário e na
   importação CSV. Sem telefone o morador não fica sabendo que a encomenda
   chegou, que é o produto inteiro.
2. **Telefone é gravado em E.164** (`+5532999999999`) — formato que o gateway
   espera. Mas **ninguém digita `+55`**: a tela pede `(32) 99999-9999` e a
   conversão acontece na borda da API (`@TelefoneE164` em
   `src/common/telefone.ts`). A API continua aceitando quem já manda E.164.
3. **Número de outro país** é aceito quando digitado começando com `+`
   (`+351912345678`) — a máscara brasileira não se aplica nesse caso.
4. **Um morador principal por apartamento.** É ele que recebe a notificação
   quando a encomenda não tem destinatário explícito. Marcar um novo como
   principal desmarca o anterior.
5. **`receber_whatsapp = false` é opt-out** e precisa ser respeitado por todo
   disparo — inclusive cobrança de vaga.
6. **Trocar de apartamento** revalida que o destino é do mesmo condomínio.
7. Remoção é desativação — histórico de encomendas aponta para o morador.
8. **Importação CSV normaliza o telefone** e recusa a linha com o motivo; antes,
   telefone escrito solto estourava o CHECK do banco com erro técnico.

## Frontend

`web/src/pages/Moradores.tsx` + `components/MoradoresManager.tsx` (reaproveitado
na tela do superadmin).

| Peça | Papel |
|---|---|
| `components/ui/phone-input.tsx` | Digita `(32) 99999-9999`, entrega E.164 |
| `lib/telefone.ts` | `formatarTelefone` (listagens), `paraE164`, `mascaraTelefone` |
| `components/ui/search-select.tsx` | Escolha do apartamento com busca por digitação |

**A busca do apartamento é feita no servidor** (`GET /apartamentos?q=`), com
debounce: a lista não cabe num select em condomínio grande (o backend corta em
50). Digitar `A` traz o bloco A; digitar `1` traz as unidades que **começam** com
1. Quem passa `onSearchChange` ao `SearchSelect` não filtra de novo no cliente —
o servidor casa também pelo número, que não está no rótulo (`A-101` não começa
com `1`, mas o apartamento sim).

## Decisões e armadilhas

- **O mesmo telefone pode existir em dois condomínios** (quem mora em dois, um
  síndico). O módulo WhatsApp trata a ambiguidade no inbound; ao mexer em busca
  por telefone, lembre que ela **não** é única globalmente.
- **Na edição, o apartamento atual do morador é injetado nas opções** do select:
  a lista vem cortada/filtrada e ele poderia não estar lá.
- O nome passa por `trim` antes do `IsNotEmpty` — `"   "` passaria como
  preenchido e viraria morador sem nome na listagem.

## Ao alterar este módulo

- [ ] Campo novo → veja importação CSV, `MoradoresManager` e os templates que
      usam dados do morador.
- [ ] Mexeu em `principal` ou `receber_whatsapp` → confira encomendas (escolha do
      destinatário) e notificações (opt-out).
- [ ] Campo de telefone novo em qualquer lugar → `@TelefoneE164()` no DTO e
      `PhoneInput` na tela. Nunca peça `+55` ao usuário.
- [ ] `test/moradores.e2e-spec.ts` cobre obrigatórios, normalização e busca por
      prefixo — rode ao mexer nisso.
