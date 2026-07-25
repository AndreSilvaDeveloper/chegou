# Módulo: Encomendas

O coração do produto. O porteiro registra o que chegou, o morador é avisado no
WhatsApp e retira apresentando um código de 4 dígitos.

## Rotas e perfis

| Rota | superadmin | admin | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| `POST /encomendas` — registrar | — | ✅ | ✅ | ✅ |
| `GET /encomendas` — listar/filtrar | — | ✅ | ✅ | ✅ |
| `GET /encomendas/:id` | — | ✅ | ✅ | ✅ |
| `POST /encomendas/:id/retirar` | — | ✅ | ✅ | ✅ |
| `GET /encomendas/stats` | — | ✅ | ✅ | — |
| `GET /encomendas/dashboard` | — | ✅ | ✅ | — |
| `GET /encomendas/export.csv` | — | ✅ | ✅ | — |
| `POST /encomendas/:id/cancelar` | — | ✅ | ✅ | — |

O porteiro opera o dia a dia; cancelar e ver número consolidado é gestão.

## Dados

Tabela `encomendas` (`tenant_id NOT NULL`). Campos que importam:

- `codigo_retirada` — 4 dígitos, **único entre as encomendas ativas** do
  condomínio. Repetir código entre encomendas já retiradas é aceitável.
- `status` — `aguardando → notificado → retirada | cancelada | devolvida`
- `apartamento_id` (obrigatório) e `morador_destino_id` (opcional)
- `recebida_por_user_id`, `retirada_por_morador_id`, `retirada_documento`
- `foto_url` — foto da etiqueta/volume, via módulo Storage
- carimbos: `notificada_at`, `retirada_at`, `cancelada_at` + `cancelamento_motivo`

## Regras de negócio

1. **Apartamento e morador são validados contra o condomínio** na criação. Se
   `moradorDestinoId` vier, ele precisa morar naquele apartamento — senão a
   notificação iria para a pessoa errada.
2. **Sem destinatário explícito**, a encomenda é do morador `principal` do
   apartamento; é para ele que a notificação vai.
3. **Retirada exige código OU documento** — nunca os dois vazios. Código errado
   é 400; encomenda já retirada/cancelada é 409 (não 400: o pedido está certo,
   o estado é que não permite).
4. **Só encomenda ativa** (`aguardando`, `notificado`) pode ser retirada ou
   cancelada.
5. **Notificação nunca é enviada direto** — vai para a fila (módulo
   Notificações), que aplica janela de horário e ritmo anti-bloqueio.
6. Cancelamento **exige motivo** e fica registrado.

## Depende de

`Apartamento`, `Morador`, `Tenant`, `WhatsappMessage` · `WhatsappService`
(envio) · `NotificationService` (fila).

## Frontend

`web/src/pages/Encomendas.tsx` (lista + filtros), `NovaEncomenda.tsx` (registro,
com leitor de código de barras em `components/ScannerModal.tsx`),
`DetalheEncomenda.tsx` (retirada e histórico).

## Decisões e armadilhas

- **Código de 4 dígitos** é curto de propósito: o morador digita no WhatsApp e o
  porteiro confere na portaria. A unicidade só entre ativas é o que torna isso
  viável em condomínio grande.
- **Estatísticas e série do dashboard usam data local** (`America/Sao_Paulo`),
  não UTC — senão a encomenda das 22h aparece no dia seguinte.
- A listagem anexa notificações e destinatário em consultas separadas para não
  multiplicar linhas com JOIN.

## Ao alterar este módulo

- [ ] Mudou status ou transição? Atualize a lista de status aqui e confira quem
      depende dele (relatórios, dashboard, filtros do frontend).
- [ ] Campo novo no DTO que referencia outra entidade → `assertRefDoTenant()`.
- [ ] Mudou o texto da notificação? O template vive em
      `src/modules/whatsapp/templates.ts` (module WhatsApp).
- [ ] Rodar `npm run test:e2e` — `test/encomendas.e2e-spec.ts` cobre o fluxo de
      retirada.
