# Módulo: WhatsApp (gateway e mensagens)

Fala com o provedor de WhatsApp e guarda o histórico. Recebe também as respostas
do morador ("cheguei", o código de retirada).

## Rotas e perfis

| Rota | Acesso |
|---|---|
| `POST /webhooks/:provider` | `@Public()` — validado por assinatura do provedor |

O painel não fala com este módulo direto: quem mostra status e configuração da
conexão é o módulo **OpenWA**; quem agenda envio é **Notificações**.

## Estrutura

- `gateway/whatsapp.gateway.ts` — interface do provedor
- adapters: **Twilio** (completo) e **Z-API** (stub)
- `gateway/sms.gateway.ts` — fallback por SMS
- `templates.ts` — textos: `encomenda_chegou`, `retirada_confirmada`,
  `lembrete_codigo`, `sem_encomenda_pendente`
- filas BullMQ: `notify-morador`, `confirmar-retirada`

## Dados

`whatsapp_messages` — **`tenant_id` aceita NULL** de propósito: mensagem que
chega de número desconhecido (ou ambíguo) não tem dono.

## Regras de negócio

1. **Assinatura do webhook é verificada** antes de qualquer processamento;
   inválida → 403.
2. **Idempotência na entrada** por `providerMessageId`: o provedor reenvia, e
   reprocessar daria baixa duplicada.
3. **Resolução do remetente** (`resolverMoradorInbound`):
   - 1 morador com aquele telefone → é ele;
   - vários (mesmo telefone em condomínios diferentes) → o **número de destino**
     desempata, porque cada condomínio tem o seu;
   - sem desempate → mensagem fica **sem condomínio**, com log de aviso.
     Atribuir ao condomínio errado significaria dar baixa em encomenda alheia.
4. **Toda saída passa pelo módulo Notificações** — enviar direto fura a janela de
   horário e o ritmo anti-bloqueio.
5. Mensagem sem `tenantId` ou sem `moradorId` **não vira intenção** (não dá baixa,
   não responde código).

## Ao alterar este módulo

- [ ] Template novo → adicione em `TemplateKey`, `TemplateVariables` e
      `renderTemplate` (o TypeScript cobra os três).
- [ ] Provedor novo → implemente a interface `WhatsappGateway`; não espalhe
      `if (provider === ...)` pelo código.
- [ ] Mexeu no inbound → cuide da ambiguidade de telefone entre condomínios; é
      um vazamento entre tenants disfarçado de detalhe.
