# Módulo: Avisos

Comunicados do condomínio para os moradores, disparados por WhatsApp. Módulo
**opcional** (`@RequiresModule('avisos')`).

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /avisos`, `GET /avisos/:id` | ✅ | ✅ | ✅ |
| `POST /avisos` | ✅ | ✅ | — |
| `DELETE /avisos/:id` (desativa) | ✅ | ✅ | — |

O porteiro lê para saber o que foi comunicado; publicar é da gestão.

## Dados

`avisos` (`tenant_id NOT NULL`): `titulo`, `conteudo`, `tipo` (geral, urgente,
manutencao, evento, financeiro), `destinatario` (todos / bloco / apartamento) +
`destinatario_filtro` (JSON), `enviar_whatsapp`, `criado_por_id`, `enviada_at`,
`ativo`.

## Regras de negócio

1. **Público-alvo**: todos os moradores ativos, os de um bloco, ou os de um
   apartamento.
2. **`apartamentoId` do filtro é validado** contra o condomínio. Sem isso o aviso
   seria "enviado" para ninguém, sem erro nenhum.
3. **Só morador com telefone entra no disparo**; o opt-out
   (`receber_whatsapp = false`) é respeitado pela fila.
4. **O disparo vai para a fila** de notificações, uma por morador — é o que
   protege o número do condomínio num aviso para o prédio inteiro.
5. `tenantId` é aplicado **depois** do spread do DTO em `create()`.
6. Remoção é desativação; o histórico do que foi comunicado permanece.

## Frontend

`web/src/pages/Avisos.tsx`.

## Ao alterar este módulo

- [ ] Tipo de destinatário novo → ajuste o filtro em `dispararNotificacoes` **e**
      a validação em `assertDestinatarioDoTenant`.
- [ ] Lembre da conta: aviso para o prédio inteiro vira N notificações. Confira o
      limite diário do condomínio antes de aumentar o alcance.
