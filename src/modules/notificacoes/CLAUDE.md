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

1. O módulo de origem chama `NotificationService.agendarNotificacao(...)`.
2. `DispatchScheduler.reserve(tenantId, cfg)` calcula **quando** essa mensagem
   pode sair, respeitando janela de horário, intervalo mínimo com jitter e o
   limite diário do condomínio.
3. O job entra na fila BullMQ `notification-dispatch` com esse atraso.
4. `NotificationDispatcher` envia pelo gateway e grava o resultado.

A configuração vem do `config_json` do condomínio (`DEFAULT_TENANT_CONFIG` como
base): `horarioEnvioInicio` / `horarioEnvioFim`, `whatsappIntervaloSegundos`,
`whatsappJitterSegundos`, `whatsappLimiteDiario`.

## Regras de negócio

1. **Fora da janela de horário, agenda para a próxima abertura** — não descarta e
   não envia de madrugada.
2. **Intervalo com jitter** entre mensagens: cadência humana, não rajada.
3. **Limite diário por condomínio**; ao estourar, empurra para o dia seguinte.
4. **Serializado por condomínio** — cada um tem o próprio número no gateway.
5. **Reenviar cria um novo agendamento**, passando pelo scheduler de novo (não
   fura a fila).
6. Fuso de referência: `America/Sao_Paulo`.

> As regras completas estão em "Regras Anti-Bloqueio WhatsApp" no `CLAUDE.md`
> raiz. Elas existem para o número do condomínio não ser bloqueado — mexer aqui
> sem entender o motivo é o caminho mais rápido para derrubar o WhatsApp do
> cliente.

## Frontend

`web/src/pages/Notificacoes.tsx` ("Filas") + `components/NotifBadge.tsx`.

## Ao alterar este módulo

- [ ] Tipo novo de notificação → registre o enum, o template e quem consome.
- [ ] Mexeu em ritmo/janela/limite → confirme que continua respeitando as regras
      anti-bloqueio e atualize os padrões em `config-tenant.dto.ts`.
- [ ] Origem nova de disparo → chame `agendarNotificacao`, **nunca** o gateway
      direto.
