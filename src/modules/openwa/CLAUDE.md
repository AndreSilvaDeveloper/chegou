# Módulo: OpenWA (sessão não-oficial por condomínio)

Cada condomínio tem a **própria instância** de WhatsApp no gateway não-oficial:
número próprio, QR próprio, status próprio. Este módulo provisiona e opera essa
sessão.

## Rotas e perfis

| Rota | superadmin | admin | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| `GET /whatsapp/config`, `PATCH /whatsapp/config` | — | ✅ | ✅ | — |
| `GET /whatsapp/connection` (status) | — | ✅ | ✅ | — |
| `POST /whatsapp/connection/connect` | — | ✅ | ✅ | — |
| `GET /whatsapp/connection/qr` | — | ✅ | ✅ | — |
| `POST /whatsapp/connection/restart` \| `/disconnect` | — | ✅ | ✅ | — |
| `POST /webhooks/openwa/:tenantId` | `@Public()` (o gateway chama) | | | |

Visão consolidada da plataforma fica em `/admin/whatsapp` (módulo Admin).

## Dados

Guardados no próprio `tenants`: `whatsapp_session_id`, `whatsapp_session_name`,
`whatsapp_status`, `whatsapp_numero`.

## Regras de negócio

1. **Provisionamento na criação do condomínio é best-effort**
   (`provisionForTenant` engole erro): gateway fora do ar não pode impedir o
   cadastro. O `provision()` manual, chamado pela tela, **propaga** o erro.
2. **Estados**: `connected` · `connecting` · `qr` (esperando leitura) ·
   `disconnected` · `error`.
3. **QR é efêmero** — a tela busca sob demanda, nunca guarda.
4. **Webhook por condomínio**: a URL carrega o `tenantId`, então o status chega
   já atribuído.
5. `OpenWaNotConnectedError` e `WhatsappNumberNotFoundError` existem para a UI
   dizer o que fazer, em vez de "erro inesperado".

## Frontend

`web/src/pages/Whatsapp.tsx`, `components/WhatsappConnectionCard.tsx`,
`components/WhatsappTemplateCard.tsx` e `web/src/components/whatsapp/`.

## Ao alterar este módulo

- [ ] Estado novo de conexão → mapeie no webhook, no `ConnectionInfo` e no card
      do frontend.
- [ ] Lembre que o número do condomínio é o que desempata o inbound ambíguo
      (ver módulo WhatsApp) — mexer em `whatsapp_numero` afeta aquilo.
