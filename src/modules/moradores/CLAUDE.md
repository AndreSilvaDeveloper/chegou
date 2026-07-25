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

1. **Telefone em E.164** (`+5511999999999`). É o formato que o gateway espera;
   qualquer outra coisa falha no envio.
2. **Um morador principal por apartamento.** É ele que recebe a notificação
   quando a encomenda não tem destinatário explícito. Marcar um novo como
   principal desmarca o anterior.
3. **`receber_whatsapp = false` é opt-out** e precisa ser respeitado por todo
   disparo — inclusive cobrança de vaga.
4. **Trocar de apartamento** revalida que o destino é do mesmo condomínio.
5. Remoção é desativação — histórico de encomendas aponta para o morador.

## Frontend

`web/src/pages/Moradores.tsx` + `components/MoradoresManager.tsx` (reaproveitado
na tela do superadmin) e `components/ui/phone-input.tsx` para o E.164.

## Decisões e armadilhas

- **O mesmo telefone pode existir em dois condomínios** (quem mora em dois, um
  síndico). O módulo WhatsApp trata a ambiguidade no inbound; ao mexer em busca
  por telefone, lembre que ela **não** é única globalmente.

## Ao alterar este módulo

- [ ] Campo novo → veja importação CSV, `MoradoresManager` e os templates que
      usam dados do morador.
- [ ] Mexeu em `principal` ou `receber_whatsapp` → confira encomendas (escolha do
      destinatário) e notificações (opt-out).
