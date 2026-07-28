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
| `GET /moradores/autocadastro-link` (token do QR) | ✅ | ✅ | — |
| `POST /moradores/autocadastro-link/rotate` (novo link) | ✅ | ✅ | — |

O porteiro consulta para saber a quem entregar; cadastro é da gestão.

### Rotas públicas (autocadastro via QR) — sem login

| Rota | Acesso |
|---|---|
| `GET /public/autocadastro/:token` | `@Public` — nome do condomínio + unidades |
| `POST /public/autocadastro/:token` | `@Public` — cria o morador |

O condomínio **vem do token** (coluna `tenants.autocadastro_token`, UNIQUE),
resolvido no servidor — o `tenantId` nunca chega pelo corpo. `@Throttle` aperta a
rota de escrita (5/min por IP). Arquivos: `autocadastro.controller.ts` /
`autocadastro.service.ts`. Front público: `web/src/pages/AutocadastroMorador.tsx`
em `/cadastro/:token`, **fora** do Layout.

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
9. **Autocadastro entra como não-principal e recebendo WhatsApp.** `principal` e
   `receber_whatsapp` são decisão da gestão, não de quem se cadastra — por isso o
   `AutocadastroMoradorDto` nem expõe esses campos. Quem cria de fato é o
   `MoradoresService.criar`, reaproveitando todas as regras (apto do condomínio,
   E.164, principal). O cadastro é **ativo na hora** (decisão de produto): a rede
   contra "unidade errada" é o passo de revisão na tela, não uma fila de aprovação.
10. **O token do link é revogável.** "Gerar novo link" rotaciona
    `autocadastro_token`; o QR anterior (impresso/salvo) para de funcionar na hora.
    Token inválido/revogado responde **404 genérico**, sem deixar concluir que
    existe outro.

## Frontend

`web/src/pages/Moradores.tsx` + `components/MoradoresManager.tsx` (reaproveitado
na tela do superadmin).

| Peça | Papel |
|---|---|
| `components/ui/phone-input.tsx` | Digita `(32) 99999-9999`, entrega E.164 |
| `lib/telefone.ts` | `formatarTelefone` (listagens), `paraE164`, `mascaraTelefone` |
| `components/ui/search-select.tsx` | Escolha do apartamento com busca por digitação |
| `components/QrAutocadastroDialog.tsx` | Diálogo do link/QR (gera, copia, baixa, rotaciona) |
| `pages/AutocadastroMorador.tsx` | Página pública `/cadastro/:token` (preenche → revisa → confirma) |
| `api/client.ts` → `apiPublic` | Requests sem `Authorization`/`X-Tenant-Id` para a rota pública |

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
- **`GET /moradores/autocadastro-link` colide com `GET /moradores/:id`.** O
  `MoradoresController` tem `@Get(':id')` com `ParseUUIDPipe`; se ele for
  registrado antes, "autocadastro-link" cai no `:id` e volta **400 (uuid
  expected)**. Por isso, no `moradores.module.ts`, o `AutocadastroLinkController`
  vem **antes** do `MoradoresController` no array de `controllers` — o Express
  casa na ordem de registro, então a rota estática tem que vir primeiro.

## Ao alterar este módulo

- [ ] Campo novo → veja importação CSV, `MoradoresManager` e os templates que
      usam dados do morador.
- [ ] Mexeu em `principal` ou `receber_whatsapp` → confira encomendas (escolha do
      destinatário) e notificações (opt-out).
- [ ] Campo de telefone novo em qualquer lugar → `@TelefoneE164()` no DTO e
      `PhoneInput` na tela. Nunca peça `+55` ao usuário.
- [ ] `test/moradores.e2e-spec.ts` cobre obrigatórios, normalização e busca por
      prefixo — rode ao mexer nisso.
- [ ] Mexeu no autocadastro (token, rota pública, DTO) → `test/multitenant.e2e-spec.ts`
      cobre isolamento por token, revogação e 404 genérico. Rode `npm run test:e2e`.
