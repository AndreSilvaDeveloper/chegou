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
| `POST /webhooks/openwa/:tenantId` | `@Public()` — vive no módulo **WhatsApp** | | | |

Visão consolidada da plataforma fica em `/admin/whatsapp` (módulo Admin).

## Dados

Guardados no próprio `tenants`: `whatsapp_session_id`, `whatsapp_session_name`,
`whatsapp_status`, `whatsapp_numero`.

## Modelos de mensagem do condomínio (`/whatsapp/config`)

O síndico (e a administradora) edita **dois** textos, ambos em
`tenants.config_json`:

| Config | Quando sai | Padrão e variáveis |
|---|---|---|
| `whatsappTemplateEncomenda` | encomenda registrada na portaria | `DEFAULT_TEMPLATE_ENCOMENDA` / `VARIAVEIS_ENCOMENDA` |
| `whatsappTemplateRetirada` | morador retirou a encomenda | `DEFAULT_TEMPLATE_RETIRADA` / `VARIAVEIS_RETIRADA` |

Os dois padrões e os renderizadores vivem em
`notificacoes/message-template.ts` — este módulo só lê e grava.

### Ritmo de envio, também editável pelo condomínio

O mesmo `PATCH` aceita as regras de disparo. As faixas estão em
`dto/atualizar-config.dto.ts` e são devolvidas no `GET` (campo `limites`) — a
tela lê de lá em vez de repetir os números:

| Campo | Faixa do síndico | Por quê |
|---|---|---|
| `intervaloSegundos` | **≥ 60**, até 3600 | 60s é o piso anti-bloqueio; subir é sempre mais seguro |
| `horarioEnvioInicio` / `Fim` | dentro de **08:00–21:00**, início < fim | Regra anti-bloqueio nº 5 — pode estreitar, nunca esticar |
| `limiteDiario` | **20 a 300** | "0 = ilimitado" continua existindo, mas só pela plataforma |
| `jitterSegundos` | — | Só o superadmin: é o disfarce de cadência, não uma preferência |

Acima dessas faixas, só o superadmin em `/admin/whatsapp` (módulo Admin), que
usa outro DTO, mais frouxo. A validação de janela é do service porque depende
dos dois horários juntos; o resto é `class-validator` no DTO.

O dispatcher lê essa config **direto do banco** a cada notificação
(`NotificationService.getAntiBanConfig`), então a mudança vale no próximo envio,
sem cache para invalidar.

Regras que valem para os modelos de mensagem:

1. **Campo vazio = usa o padrão do sistema.** É assim que uma melhoria no texto
   padrão chega aos condomínios que nunca personalizaram.
2. **`PATCH` aceita os dois campos, ambos opcionais.** Campo ausente não é
   tocado — a tela manda só o que mudou, e quem editou só a retirada continua
   acompanhando o padrão de chegada.
3. A tela **abre com o texto efetivo preenchido** (o do condomínio ou o padrão),
   não em branco: o síndico precisa ver a mensagem real para mudar uma palavra.

## Custo de um envio (o que o disparo em escala paga)

`sendText` era 3 a 4 chamadas HTTP ao gateway **por mensagem** (`getSession` +
`checkNumber` 1–2× + `sendText`), mais um `UPDATE tenants` a cada envio. Com o
worker compartilhado, isso era o teto da plataforma. Hoje:

| Peça | Cache | Chave | Invalidação |
|---|---|---|---|
| Status da sessão | 30 s | `wa:sess:{tenant}` | `persist()` e webhook de status |
| JID do destinatário | 30 dias | `wa:jid:{tenant}:{numero}` | falha no envio apaga a chave |

Sobra **uma** chamada HTTP no caminho quente. O `UPDATE tenants` só acontece
quando o status realmente mudou.

Toda chamada ao gateway tem `OPENWA_TIMEOUT_MS` (padrão 15 s). Sem timeout, o
padrão do Node espera até 5 minutos — e um worker preso é fila parada para
outros condomínios.

## Regras de negócio

1. **Provisionamento na criação do condomínio é best-effort**
   (`provisionForTenant` engole erro): gateway fora do ar não pode impedir o
   cadastro. O `provision()` manual, chamado pela tela, **propaga** o erro.
2. **Estados**: `connected` · `connecting` · `qr` (esperando leitura) ·
   `disconnected` · `error`.
3. **QR é efêmero** — a tela busca sob demanda, nunca guarda.
4. **Webhook por condomínio**: a URL carrega o `tenantId`, então o status chega
   já atribuído. O controller mora no módulo **WhatsApp** (`webhook-openwa.controller.ts`)
   porque também trata as mensagens recebidas — assim a dependência fica em um
   sentido só: `whatsapp → openwa`.
5. `OpenWaNotConnectedError` e `WhatsappNumberNotFoundError` existem para a UI
   dizer o que fazer, em vez de "erro inesperado".

## Frontend

`web/src/pages/Whatsapp.tsx`, `components/WhatsappConnectionCard.tsx`,
`components/WhatsappTemplateCard.tsx`, `components/WhatsappEnvioCard.tsx` e
`web/src/components/whatsapp/`.

> Os dois cards de configuração compartilham a query `['whatsapp-config']` e
> cada um salva só os seus campos. Por isso ambos só relêem do servidor quando
> **os campos deles** mudaram lá (a "assinatura" guardada num `useRef`) — sem
> isso, salvar um card apagaria o que estivesse sendo digitado no outro.

## Ao alterar este módulo

- [ ] Estado novo de conexão → mapeie no webhook, no `ConnectionInfo` e no card
      do frontend.
- [ ] Modelo de mensagem novo → padrão + variáveis em
      `notificacoes/message-template.ts`, campo em `ConfigTenantDto`, retorno em
      `getWhatsappConfig`, campo opcional no `AtualizarTemplateDto` e editor na
      tela (aqui e em `/admin/whatsapp`, que edita o mesmo dado).
- [ ] Lembre que o número do condomínio é o que desempata o inbound ambíguo
      (ver módulo WhatsApp) — mexer em `whatsapp_numero` afeta aquilo.
