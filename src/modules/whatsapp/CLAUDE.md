# Módulo: WhatsApp (histórico e conversa)

Guarda o histórico de mensagens, recebe o que o morador escreve e responde na
hora quem pergunta o código. **Não há adapter de provedor**: o envio é do
gateway próprio (módulo OpenWA), uma sessão por condomínio.

## Rotas e perfis

| Rota | Acesso |
|---|---|
| `POST /webhooks/openwa/:tenantId` | `@Public()` — o gateway chama |

O painel não fala com este módulo direto: status e configuração da conexão são
do módulo **OpenWA**; disparo em massa é do módulo **Notificações**.

## Onde cada envio nasce

| Envio | Caminho |
|---|---|
| Encomenda chegou | `encomendas` → fila de notificações → OpenWA |
| Encomenda retirada | `encomendas` → fila de notificações → OpenWA |
| Aviso, cobrança de vaga | módulo de origem → fila de notificações → OpenWA |
| **Resposta ao morador** (código, "sem encomenda") | **aqui**, direto no OpenWA |

A resposta é a única que não passa pela fila, de propósito: é réplica a uma
mensagem que o morador acabou de mandar. Segurar isso numa fila de ritmo
transformaria uma conversa em silêncio — e a janela de 24h do WhatsApp está
aberta justamente porque ele escreveu.

## Estrutura

- `whatsapp.service.ts` — histórico, resolução do remetente e intenções
- `templates.ts` — só os textos **fixos** do sistema: `lembrete_codigo`,
  `sem_encomenda_pendente` (e `encomenda_chegou`, usado no envio direto). Os
  textos que o condomínio personaliza — **chegada e retirada da encomenda** —
  vivem em `notificacoes/message-template.ts`; duplicá-los aqui faria a tela do
  síndico editar um lado e o envio usar o outro
- `webhook-openwa.controller.ts` — entrada de eventos do gateway
- `inbound-openwa.parser.ts` — traduz o payload do gateway para o histórico

> O webhook do OpenWA mora **aqui**, e não no módulo dele, para a dependência ter
> um sentido só: `whatsapp → openwa`. Ao contrário, os dois se importariam.

## Dados

`whatsapp_messages` — **`tenant_id` aceita NULL** de propósito: mensagem de
número desconhecido (ou ambíguo) não tem dono. `provider` é sempre `openwa`.

## Regras de negócio

1. **Idempotência na entrada** por `providerMessageId`: o gateway reentrega, e
   reprocessar responderia duas vezes ao morador.
2. **Eco não é entrada**: mensagem com `fromMe` é o que o próprio condomínio
   enviou, e é descartada.
3. **Resolução do remetente** (`resolverMoradorInbound`):
   - 1 morador com aquele telefone → é ele;
   - vários (mesmo número em condomínios diferentes) → o **número de destino**
     desempata, porque cada condomínio tem o seu;
   - sem desempate → mensagem fica **sem condomínio**, com log de aviso.
     Atribuir ao errado significaria responder em nome de outro condomínio.
4. **Mensagem sem `tenantId` ou sem `moradorId` não vira intenção.**
5. **O tradutor do payload é defensivo**: o gateway não tem contrato estável
   entre versões (`from`/`chatId`/`author`, `body`/`text`/`content`), então lê
   por alternativas e devolve `null` quando falta o mínimo. Melhor ignorar do
   que gravar pela metade e responder errado.
6. **A resposta automática não segura o webhook** — roda solta e loga a falha.
   Demorar faz o gateway reentregar, e reentrega vira mensagem duplicada.

## Ao alterar este módulo

- [ ] Template novo → adicione em `TemplateKey`, `TemplateVariables` e
      `renderTemplate` (o TypeScript cobra os três).
- [ ] Mexeu no tradutor → `inbound-openwa.parser.spec.ts` cobre; rode.
- [ ] Envio novo em massa → use a fila de notificações, nunca este service.
- [ ] Cuide da ambiguidade de telefone entre condomínios: é um vazamento entre
      tenants disfarçado de detalhe.
