# Módulo: Notificações

A fila única por onde passa **todo** disparo ao morador — encomenda, aviso e
cobrança de vaga. É aqui que moram as regras anti-bloqueio do WhatsApp: nenhum
módulo envia direto.

## Rotas e perfis

| Rota | admin | sindico | porteiro |
|---|:---:|:---:|:---:|
| `GET /notificacoes` (filtros + paginação) | ✅ | ✅ | — |
| `GET /notificacoes/stats` | ✅ | ✅ | — |
| `POST /notificacoes/:id/cancelar` | ✅ | ✅ | — |
| `POST /notificacoes/:id/reenviar` | ✅ | ✅ | — |

## Dados

`notificacoes` (`tenant_id NOT NULL`): `tipo` (encomenda, aviso, cobrança),
destinatário (telefone + nome + `morador_id`), `conteudo`, `variaveis_json`,
`referencia_tipo` / `referencia_id` (o que originou), `status`, tentativas e
carimbos.

## Como funciona

1. O módulo de origem chama `NotificationService.agendarNotificacao(...)` — ou
   `agendarEmLote([...])`, quando são muitas de um condomínio só.
2. `DispatchScheduler.reserve(tenantId, cfg)` calcula **quando** essa mensagem
   pode sair, respeitando janela de horário, intervalo mínimo com jitter e o
   limite diário do condomínio.
3. O job entra na fila BullMQ `notification-dispatch` com esse atraso.
4. `NotificationDispatcher` pega a **trava do condomínio**, envia pelo gateway e
   grava o resultado.

## Escala: o que é paralelo e o que não é

| Nível | Regra | Onde |
|---|---|---|
| Plataforma | **N condomínios enviando ao mesmo tempo** (`NOTIFICATION_CONCURRENCY`, padrão 15) | `@Processor` + `worker.concurrency` |
| Condomínio | **um envio por vez**, garantido por trava no Redis (`wa:envio:{tenant}`) | `NotificationDispatcherService.process` |
| Mensagem | intervalo + jitter entre uma e outra do mesmo número | `DispatchScheduler` |

A serialização que protege o número é **por condomínio**, não por plataforma.
Com `concurrency: 1` global (como era), um condomínio com o gateway lento
segurava a fila de todo mundo e o teto do produto inteiro era uma mensagem por
vez. Job que chega e encontra o condomínio ocupado volta para a fila com
`moveToDelayed` + `DelayedError` — não gasta tentativa, porque não houve falha.

`WORKER_ENABLED=false` desliga o consumo da fila numa instância (réplica que só
atende HTTP). Sem isso, escalar a API na horizontal multiplicaria os workers.

### Reserva de slot e cota diária (Redis, atômicos)

- **Slot** (`wa:slot:{tenant}`): o próximo horário livre do condomínio. O
  read-modify-write é um **script Lua** — em dois comandos separados, duas
  encomendas registradas no mesmo segundo pegavam o mesmo horário e saíam
  juntas pelo mesmo número, que é o padrão de rajada que gera bloqueio.
- **Cota** (`wa:cota:{tenant}:{YYYY-MM-DD}`): conta pelo **dia em que a mensagem
  vai sair**, não pelo dia em que foi criada. Antes era um `COUNT` por
  `created_at`: mensagem adiada para amanhã contava hoje e não contava amanhã,
  então com backlog o número furava o próprio limite.
- Mensagem que não cabe na cota do dia vai para a abertura da janela seguinte,
  até 14 dias. Estourou os 14, sai fora da cota com log de **erro** — sinal de
  que a demanda do condomínio passou do que o número aguenta.
- A cota vive só no Redis (`appendonly` em produção). Perder o Redis reseta o
  contador do dia; o slot também. É recuperável e nada se perde — só o ritmo
  daquele momento.

A configuração vem do `config_json` do condomínio (`DEFAULT_TENANT_CONFIG` como
base): `horarioEnvioInicio` / `horarioEnvioFim`, `whatsappIntervaloSegundos`,
`whatsappJitterSegundos`, `whatsappLimiteDiario`.

**Quem edita isso**: o síndico, em `/whatsapp`, dentro de faixas seguras
(intervalo ≥ 60s, janela dentro de 08:00–21:00, limite de 20 a 300/dia); o
superadmin, sem essas amarras, em `/admin/whatsapp`. As faixas e o porquê estão
no [módulo OpenWA](../openwa/CLAUDE.md). A leitura é sempre direta do banco, sem
cache — mudou, vale no próximo disparo.

### `message-template.ts` — os textos que o condomínio edita

Aqui moram os dois modelos personalizáveis, com padrão, variáveis `{{token}}` e
renderizador:

| Modelo | Padrão | Variáveis | Config do tenant |
|---|---|---|---|
| Chegada | `DEFAULT_TEMPLATE_ENCOMENDA` | `VARIAVEIS_ENCOMENDA` | `whatsappTemplateEncomenda` |
| Retirada | `DEFAULT_TEMPLATE_RETIRADA` | `VARIAVEIS_RETIRADA` | `whatsappTemplateRetirada` |

`resolveTemplate*()` decide entre o texto do condomínio e o padrão (vazio =
padrão), e `renderTemplate()` troca os tokens — **token desconhecido vira string
vazia**, para nunca vazar `{{...}}` na mensagem do morador.

A retirada não tem `{{codigo}}`: o código já foi usado. E as variáveis `data` /
`hora` dela são as **da retirada**, não as do recebimento.

A edição é pela tela `/whatsapp` (módulo OpenWA) e por `/admin/whatsapp`.

## Regras de negócio

1. **Fora da janela de horário, agenda para a próxima abertura** — não descarta e
   não envia de madrugada.
2. **Intervalo com jitter** entre mensagens: cadência humana, não rajada.
3. **Limite diário por condomínio**; ao estourar, empurra para o dia seguinte.
4. **Serializado por condomínio** — cada um tem o próprio número no gateway.
5. **Reenviar cria um novo agendamento**, passando pelo scheduler de novo (não
   fura a fila).
6. Fuso de referência: `America/Sao_Paulo`.
7. **Disparo em massa usa `agendarEmLote`** — um `INSERT` e um `addBulk` para o
   lote inteiro. Um aviso para o prédio são centenas de mensagens, e o síndico
   está esperando a resposta do POST; uma a uma, o request travava por segundos.
8. **Cota consumida é cota gasta**: cancelar a notificação depois não devolve a
   unidade do dia. É conservador de propósito — protege o número.

> As regras completas estão em "Regras Anti-Bloqueio WhatsApp" no `CLAUDE.md`
> raiz. Elas existem para o número do condomínio não ser bloqueado — mexer aqui
> sem entender o motivo é o caminho mais rápido para derrubar o WhatsApp do
> cliente.

## Frontend

`web/src/pages/Notificacoes.tsx` ("Filas") + `components/NotifBadge.tsx`.

## Ao alterar este módulo

- [ ] Tipo novo de notificação → registre o enum, o template e quem consome.
- [ ] Mexeu num modelo personalizável → `message-template.spec.ts` cobre
      resolução e renderização; rode.
- [ ] Mexeu em ritmo/janela/limite → confirme que continua respeitando as regras
      anti-bloqueio e atualize os padrões em `config-tenant.dto.ts`.
- [ ] Origem nova de disparo → chame `agendarNotificacao`, **nunca** o gateway
      direto. Se for mais de uma mensagem de uma vez, `agendarEmLote`.
- [ ] Mexeu no scheduler → `dispatch-scheduler.service.spec.ts` cobre
      espaçamento, isolamento entre condomínios, cota e janela; rode.
- [ ] Mexeu na trava ou na concorrência → lembre que a garantia é **um envio por
      condomínio**, e que o TTL da trava precisa cobrir o pior envio
      (3 chamadas × `OPENWA_TIMEOUT_MS`).
