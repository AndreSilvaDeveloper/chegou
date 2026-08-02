# Plano — cobrança pela Payment API (Asaas)

> **Estado: TODAS AS SEIS FASES NO CÓDIGO.**
>
> Este documento deixou de ser plano e virou **registro**. Ele guarda duas
> coisas que o código não guarda: as decisões que foram tomadas (e as
> alternativas descartadas), e **o que mudou entre o combinado e a
> implementação** — cada fase tem uma seção "o que mudou", porque quase todas
> mudaram alguma coisa ao encostar na realidade.
>
> **A regra viva não está aqui.** Ela mora no `CLAUDE.md` de cada módulo:
> [Assinaturas](../src/modules/assinaturas/CLAUDE.md) (preço, fatura, cliente,
> cupom, bloqueio) e [Pagamentos](../src/modules/pagamentos/CLAUDE.md) (tudo que
> fala com a API). Ao mexer no código, é lá que se confere — aqui se descobre
> **por quê**.
>
> Fonte da integração: `docs/PAYMENT_API_REFERENCE.md`.

---

## 1. A decisão central

**A fatura continua sendo nossa. O gateway só cobra.**

| Pergunta | Quem responde |
|---|---|
| Quanto o cliente deve neste mês? | **Chegou** (`assinatura_faturas`) |
| O cliente pagou? | **Payment API** (webhook + consulta) |
| O cliente pode usar o sistema? | **Chegou**, com base na resposta acima |

Duas consequências que valem por metade do plano:

**Não usamos `subscriptions` nem `plans` da Payment API.** Aquilo pressupõe plano
e ciclo fixos; nosso valor muda todo mês com a contagem de apartamentos ativos,
passa por faixa, preço especial, desconto e rateio entre condomínios da carteira.
Uma `subscription` de valor fixo obrigaria a mexer no plano toda vez que uma
unidade fosse cadastrada. Usamos **`customers` + cobrança avulsa por fatura**.

**Gerar a fatura e emitir a cobrança são passos separados.** A geração mensal é
local e não pode depender de rede: se o gateway estiver fora no dia 1º, as
faturas nascem do mesmo jeito e a emissão fica na fila. Misturar os dois é como
se perde um mês de faturamento por um timeout.

### O que isso derruba de premissa

A opção "cobranças avulsas" tem uma pegadinha na Payment API: a política de
acesso nasce com **`blockOnStandaloneCharges = false`** (§ AccessPolicy, defaults).
Ou seja: sem configurar nada, o `access-status` **nunca bloquearia** nossas
cobranças, porque ele só olha cobrança de assinatura por padrão. A configuração
da política é parte da instalação, não um detalhe de tela — está na fase 1.

---

## 2. Mapa de conceitos

| Chegou | Payment API | Observação |
|---|---|---|
| A plataforma (nós) | `Company` — **uma só** | `X-Company-Id` fixo, de env |
| Condomínio direto (`administradora_id IS NULL`) | `Customer` | documento do condomínio ou do responsável |
| Administradora | `Customer` | a carteira é um cliente só |
| Condomínio de carteira | **não vira customer** | quem paga é a administradora |
| `assinatura_faturas` (1 linha) | `Charge` (1 cobrança) | correlação por `externalReference` |
| `assinatura_fatura_itens` | — | composição é nossa; o gateway vê um valor só |
| Baixa manual (`POST /faturas/:id/pagar`) | `POST /charges/{id}/received-in-cash` | os dois precisam andar juntos |

**A regra de ouro do módulo não muda:** um condomínio é cobrado uma vez só, e
quem decide é o vínculo. `responsavelPeloCondominio()` continua sendo a função
que diz quem é o sacado — agora ela também diz **qual customer** e **de quem é o
bloqueio** de um condomínio de carteira.

---

## 3. Preço — o que muda no modelo

### 3.1 Faixas por tipo de cliente

Hoje `assinatura_faixas` é uma tabela só, usada para condomínio e para
administradora. Vira **uma tabela por tipo de cliente**:

```
tipo_cliente = 'condominio'         tipo_cliente = 'administradora'
  até 100 ......... R$ 3,99           sem teto ........ R$ 1,99
  101 a 200 ....... R$ 3,49
  acima de 200 .... R$ 2,99
```

Continua valendo o que já está documentado e testado:

- **Não é escalonado por trecho.** 120 apartamentos caem na faixa de 3,49 e
  pagam `120 × 3,49 = R$ 418,80` — e não `100 × 3,99 + 20 × 3,49`.
- **Desconto por volume vale para a carteira.** Três condomínios de 40 unidades
  somam 120 na conta da administradora. Com a tabela própria de administradora
  isso deixa de importar para o preço unitário (1,99 é único), mas a soma
  continua sendo a base da contagem — e o modelo segue suportando faixas caso
  você queira escalonar a administradora depois.
- **Última faixa sem teto**, tetos crescentes, substituição da tabela inteira
  numa transação (`PUT /faixas`). Isso passa a valer **por tipo**.

### 3.2 Preço especial

`assinatura_condicoes` **não muda**: já cobre condomínio XOR administradora, os
três modos (`tabela`, `preco_apartamento`, `valor_fixo`), desconto percentual
aplicado por último, uma condição em aberto por cliente, encerramento por
`vigente_ate` e recusa de preço especial para condomínio de carteira.

Ou seja: **o "preço personalizado por condomínio e por administradora" que você
pediu já existe e está testado**. O que falta é só a tabela padrão por tipo.

### 3.3 Ordem de resolução do preço (a regra completa)

```
1. Tem condição vigente para este cliente?
   ├─ sim, modo valor_fixo        → valor fechado, ignora a contagem
   ├─ sim, modo preco_apartamento → qtd × preço negociado
   └─ sim, modo tabela            → cai no passo 2
2. Faixa da tabela do TIPO do cliente (condomínio ou administradora),
   escolhida pela quantidade; o preço da faixa vale para todos.
3. Aplica desconto_percentual da condição (se houver).
4. Aplica o CUPOM, se o cliente tiver um vigente (§ 3.4).
5. Arredonda uma vez, no fim. Toda a conta é em centavos.
```

O cupom entra **depois** do desconto negociado, e não antes: a negociação é o
preço do contrato; o cupom é uma campanha sobre o que aquele contrato cobraria.

### 3.4 Cupom de desconto

A Payment API tem `CouponController` completo — escopo, vigência, limite global,
limite por cliente, whitelist. **Não vamos duplicar isso**: o cupom vive lá, é
fonte única, e o painel do superadmin é uma tela sobre os endpoints deles.

Do nosso lado guardamos só a **atribuição**: qual cupom vale para qual cliente.

#### As duas armadilhas

**1. Desconto do gateway não pode nascer na cobrança.** Se mandarmos só o
`couponCode` e deixarmos a API descontar, a fatura diz R$ 418,80 e a cobrança
cobra R$ 376,92. Três coisas quebram de uma vez: o `ComoFoiCalculado` mostra ao
cliente um número que não é o que ele paga, o `resumo()` do superadmin reporta
faturado maior que recebido todo mês, e a reconciliação acusa divergência de
valor — um alarme falso mensal, que é a maneira mais rápida de ninguém mais
olhar para os alarmes.

A ordem correta tem três passos, e **nenhum pode ser pulado**:

```
1. POST /coupons/validate  (autenticado, com customerId e value)
       → discountAmount, finalValue
2. grava na fatura: cupom_codigo, cupom_desconto, valor_liquido = finalValue
3. POST /charges/undefined  com value = valor SEM o cupom + couponCode
       → confere: charge.value == fatura.valor_liquido ?
         sim  → emitida
         não  → NÃO emite, vai para Pendências com os dois valores
```

> **Mandamos o valor bruto (sem cupom) + o código.** Mandar o valor já
> descontado *e* o código aplica o desconto duas vezes. É o bug de dinheiro mais
> fácil de escrever neste plano inteiro, e tem teste dedicado.

**2. "Primeiro mês grátis" não é cupom.** `PERCENTAGE` é limitado a 90% na API,
e `FIXED_AMOUNT` que zera o valor produziria uma cobrança de R$ 0,00, que o
gateway não emite. Cortesia total já tem lugar no nosso modelo: uma condição com
`valor_fixo = 0` ou `desconto_percentual = 100`, e a regra que já existe —
**"fatura de R$ 0,00 não nasce"** — resolve sozinha.

Regra geral que sai daí: **valor líquido zero não vira cobrança.** A fatura é
gravada com o valor zerado e já nasce `paga`, com `pago_em` e o motivo
(cortesia/cupom). O histórico do cliente mostra o mês coberto em vez de um buraco.

#### Cupom expirado entre a validação e a emissão

A própria referência avisa: a API revalida na hora de aplicar, para não estourar
`maxUses` em corrida. Então o `POST /charges` pode voltar 422 por cupom inválido
depois de o validate ter dito que estava bom.

Resposta: **recalcular a fatura sem o cupom e emitir**, registrando no
`audit_log`. Isso é permitido porque a fatura ainda está em
`cobranca_status = 'pendente'` — ela nunca foi cobrada. Fatura já emitida
continua sendo fotografia intocável.

#### Onde a atribuição mora

`assinatura_cupom_cliente` — tenant XOR administradora, `codigo`, `aplicar_ate`
(competência, `null` = enquanto o cupom valer), com índice parcial de **um cupom
em aberto por cliente**, a mesma disciplina de `assinatura_condicoes`.

Uso, contagem e limite continuam sendo da API (`GET /coupons/{id}/usages`) — se
guardássemos uma cópia, as duas divergiriam no primeiro erro de rede.

#### O que dá para montar com isso

| Campanha | Como |
|---|---|
| 20% nos 3 primeiros meses | cupom `PERCENTAGE 20`, `maxUsesPerCustomer: 3`, atribuído ao cliente |
| R$ 50 off na virada | cupom `FIXED_AMOUNT 50`, `maxUses` global, `validUntil` |
| Indicação | cupom por indicador, `allowedCustomers` com o indicado |
| **Primeiro mês grátis** | **não é cupom** — condição `valor_fixo = 0` com `vigente_ate` no fim do mês |

### 3.5 O que a fase 6 mudou deste combinado

**O cupom é validado na EMISSÃO, não antes de gravar a fatura.** O plano
descrevia validar → gravar → cobrar como se os três passos fossem da geração.
Implementando, isso bateu de frente com a regra da fase 3: **a geração mensal
não pode depender de rede** — e validar cupom é uma chamada ao gateway.

A fatura passou a nascer pelo valor cheio, e os três passos acontecem na
emissão, que já é a fila com retry. Isso é legítimo pelo motivo que o próprio
plano dá no caso do cupom expirado: ali a fatura ainda está em
`cobranca_status = 'pendente'` e **nunca foi cobrada**. Fatura emitida continua
sendo fotografia intocável.

Consequência visível, e aceita: entre gerar e emitir, a tela do superadmin
mostra o valor cheio. É honesto — o desconto ainda não foi confirmado por
ninguém.

**Divergência de valor cancela a cobrança**, em vez de só não emitir. O plano
dizia "não emite, vai para Pendências"; mas a cobrança **já existe** do outro
lado nesse ponto, com um link que o cliente pode abrir e pagar. Deixá-la viva
enquanto marcamos erro seria o pior dos dois mundos.

**A reemissão sem cupom usa chave de idempotência NOVA.** A anterior está
associada, do lado deles, à tentativa que levava o cupom — reusá-la devolveria
aquela mesma tentativa recusada, em vez de criar a cobrança sem desconto.

---

## 4. Identidade do cliente no gateway

`POST /api/v1/customers` exige `name` e `document` (`@NotBlank`). Hoje `cnpj` é
opcional em `tenants` e `administradoras`.

**Decisão: o campo aceita CPF ou CNPJ.** Migration renomeia `cnpj` para
`documento` (`varchar(14)`, sem formatação) nas duas tabelas e o validador aceita
os dois — cobre o síndico que administra em nome próprio.

- Validação real de CPF/CNPJ (dígito verificador), não só tamanho. Documento
  inválido no gateway volta 400 e a fatura fica sem cobrança.
- **Sem documento, a fatura é gerada e a cobrança não.** O cliente entra na lista
  de pendências da geração, com o motivo — mesma disciplina do `ignorados` de
  hoje, que já reporta quem ficou de fora e por quê.
- `email` e `phone` vão junto quando existirem: são o que o Asaas usa para
  mandar o link. Sem e-mail, o link só existe dentro do nosso painel.
- Endereço (`endereco`, `cidade`, `uf`, `cep` já existem em `tenants`) melhora a
  emissão de boleto; é opcional na API.

### O que a fase 2 acrescentou ao combinado

Três coisas que só apareceram na implementação:

1. **O `tipo` entrou no path** (`/clientes/:tipo/:id/sincronizar`). Condomínio e
   administradora são os dois UUID: sem o tipo, um id trocado responderia "não
   encontrado", parecendo cadastro faltando em vez de busca no lugar errado.
2. **O 400 de documento duplicado adota o customer existente.** Ele acontece de
   verdade — retry depois de timeout, cliente criado à mão no painel deles,
   restauração de banco — e sem a adoção o cliente ficaria permanentemente sem
   cobrança possível, porque criar outro é impossível (documento é único entre
   os ativos da company). A conferência do documento exato é nossa: o `search`
   deles é LIKE, e adotar por semelhança cobraria o cliente errado.
3. **Condomínio de carteira é recusado do lado do Chegou**, não do gateway. Lá
   ele seria criado sem reclamação, e sobraria um cliente no Asaas que nunca
   recebe cobrança.

### Sincronização

`assinatura_clientes_gateway` guarda o vínculo:

| Coluna | Papel |
|---|---|
| `tenant_id` / `administradora_id` | XOR, mesmo CHECK das outras tabelas |
| `customer_id` | id na Payment API |
| `documento_enviado` | o que foi mandado — detecta divergência depois |
| `sincronizado_em`, `erro_ultima_sync` | diagnóstico sem abrir log |

Mudou nome, documento ou e-mail no Chegou → `PUT /customers/{id}` na próxima
emissão (não em tempo real: alteração de cadastro não pode falhar porque o
gateway está fora).

---

## 5. O módulo novo — `src/modules/pagamentos/`

Um módulo só, com fronteira clara: **ele fala com a Payment API e não conhece
regra de assinatura.** Quem sabe o que é uma fatura é o módulo Assinaturas.

```
src/modules/pagamentos/
├── pagamentos.module.ts
├── payment-api.client.ts        # HTTP puro: auth, retry, idempotência
├── payment-api.types.ts         # DTOs da API (espelho do reference)
├── cobrancas.service.ts         # emitir/cancelar/consultar cobrança de fatura
├── acesso.service.ts            # access-status + cache + fail-open
├── webhook.controller.ts        # recebe o repasse de eventos
├── webhook.processor.ts         # fila: aplica o evento na fatura
├── reconciliacao.service.ts     # varredura periódica (o webhook perdido)
└── CLAUDE.md
```

### 5.1 Autenticação

As rotas de cobrança exigem **JWT** (`Authorization: Bearer`), não API Key — só
`access-status` aceita os dois. Então:

- **O usuário de integração é criado dentro do painel da Payment API**, com
  papel `COMPANY_ADMIN` — não existe `ROLE_SYSTEM` para nós (confirmado). Tem de
  ser `COMPANY_ADMIN`, e não `COMPANY_OPERATOR`, porque estorno,
  `received-in-cash` e a escrita de cupom exigem admin.
- Login (`POST /auth/login`) com credenciais de env, uma vez.
- Access token vale 24h, refresh 7d, **com rotação** (o refresh devolve um par
  novo). Guardar os dois em Redis, com o expiry.
- Renovar **antes** de expirar (margem de 1h) e no 401, uma vez só — 401 depois
  do refresh é falha de configuração, não é para ficar em laço.
- `X-Company-Id` fixo em toda request (RLS do lado deles).

| Variável | Papel |
|---|---|
| `PAYMENT_API_BASE_URL` | vazio = cobrança desligada (mesma disciplina do `OPENWA_BASE_URL`) |
| `PAYMENT_API_COMPANY_ID` | o `X-Company-Id` |
| `PAYMENT_API_EMAIL` / `PAYMENT_API_PASSWORD` | credenciais do usuário de integração |
| `PAYMENT_API_TIMEOUT_MS` | padrão 15000 |
| `PAYMENT_WEBHOOK_TOKEN` | segredo que validamos no nosso webhook (o mesmo cadastrado no painel deles) |
| `PAYMENT_RECONCILIACAO_ADMIN` | `true` liga o atalho de `/admin/reconciliation/charges`; padrão `false` |

**Vazio desliga a integração inteira** — dev e teste rodam sem gateway, como já
acontece com o WhatsApp. Nada de mock silencioso: a fatura fica
`cobranca_status = 'desligada'` e a tela diz isso.

### 5.2 Idempotência — a parte que não pode falhar

`POST /charges/*` exige `Idempotency-Key`. **A chave é gerada uma vez e
persistida na fatura** (`cobranca_idempotency_key`), nunca gerada no retry:

```
1ª tentativa  → gera uuid, grava na fatura, POST
timeout       → não sabemos se criou
2ª tentativa  → MESMA chave → a API devolve a mesma cobrança (409/replay)
```

Gerar chave nova no retry é exatamente como se cobra o cliente duas vezes.

Somada a isso, a trava do banco: **índice único parcial em
`assinatura_faturas (id) WHERE cobranca_id IS NOT NULL`** não serve (id já é
único); o que segura é a coluna `cobranca_id` só ser gravada dentro da mesma
transação que marca `cobranca_status = 'emitida'`, e a emissão só rodar para
fatura com `cobranca_status IN ('pendente','erro')`.

### 5.3 Resiliência

- Retry só em erro de rede e 5xx: 3 tentativas, backoff exponencial com jitter.
- **Nunca** retry em 400/422 — payload errado não melhora com insistência; vira
  `cobranca_status = 'erro'` com a mensagem, para o superadmin ver.
- 409 (idempotência) **não é erro**: é a resposta certa de um retry que deu
  certo. Tratar como sucesso e ler a cobrança devolvida.
- Circuit breaker por serviço: 5 falhas seguidas → 60s parado, para não
  transformar gateway fora em fila travada.

---

## 6. Ciclo de vida da fatura

```
                    ┌───────────────────────────────────────────┐
gerar faturas  ───► │ fatura ABERTA · cobranca_status=pendente   │
(local, mensal)     └──────────────────┬────────────────────────┘
                                       │ fila (BullMQ)
                                       ▼
                       POST /charges/undefined  ──erro──► cobranca_status=erro
                                       │                   (retry + tela)
                                       ▼
                    ┌───────────────────────────────────────────┐
                    │ cobranca_status=emitida · invoice_url      │ ◄── cliente paga
                    └──────────────────┬────────────────────────┘     no link
                                       │ webhook
                                       ▼
                    ┌───────────────────────────────────────────┐
                    │ fatura PAGA · pago_em · acesso liberado     │
                    └───────────────────────────────────────────┘
```

### 6.1 Emissão

`POST /api/v1/charges/undefined` — **link único, o cliente escolhe** PIX, boleto
ou cartão na tela do Asaas (sua escolha). Payload:

| Campo | Valor |
|---|---|
| `customerId` | do `assinatura_clientes_gateway` |
| `value` | `valor_liquido` da fatura |
| `dueDate` | `vencimento` da fatura (já respeita o dia negociado) |
| `description` | `Chegou · assinatura 04/2026 · Edifício Solar` |
| `externalReference` | **o id da nossa fatura** |
| `origin` | `API` |

A resposta traz `id`, `asaasId`, `invoiceUrl`, `status`. Gravamos os quatro.

**`externalReference` é a correlação que sobrevive a tudo**: se perdermos o
`cobranca_id`, o webhook ainda diz de qual fatura ele fala.

### 6.2 Status — o mapa completo

| `ChargeStatus` (API) | Nossa fatura | Por quê |
|---|---|---|
| `PENDING` | `aberta` | emitida, esperando |
| `CONFIRMED` | `paga` | pagamento confirmado, ainda não liquidado — **o cliente não pode ficar bloqueado esperando o D+1 do banco** |
| `RECEIVED` | `paga` | liquidado |
| `OVERDUE` | `vencida` | idem à nossa regra de hoje |
| `REFUNDED` / `REFUND_IN_PROGRESS` | `estornada` (novo) | não é dívida ativa nem receita |
| `CANCELED` | `cancelada` | já existe |
| `FAILED` | `aberta` | a tentativa falhou; segue devendo |
| `CHARGEBACK_*` / `DUNNING_*` | `em_disputa` (novo) | não conta em nenhum total, aparece para o superadmin |

Dois status novos (`estornada`, `em_disputa`) obrigam a revisar, como manda o
checklist do módulo: `resumo()`, `atualizarVencidas()`, o `EM_ABERTO` de
`aviso-vencimento.ts` e `STATUS_FATURA_META` no front.

**Guardamos também o status bruto do gateway** (`cobranca_status_gateway`): o
nosso é um resumo, e resumo não serve para investigar divergência.

### 6.3 Baixa manual continua existindo

`POST /admin/assinaturas/faturas/:id/pagar` (recebido fora do gateway) passa a
chamar também `POST /charges/{id}/received-in-cash`, para os dois lados
concordarem. Se a chamada falhar, a baixa local **acontece do mesmo jeito** e a
fatura fica marcada como dessincronizada — dinheiro que entrou não pode ficar
refém de API fora do ar. A reconciliação resolve depois.

### 6.4 Cancelar

`POST /faturas/:id/cancelar` → `DELETE /charges/{id}` antes de marcar local.
Aqui a ordem é a inversa da baixa: cancelar local sem cancelar no gateway deixa
uma cobrança viva que o cliente pode pagar por engano.

---

## 7. Webhook — o dinheiro chegando

A Payment API recebe o webhook do Asaas, deduplica e processa em background — e
**repassa para uma URL nossa, cadastrada no painel dela** (confirmado). O plano
usa push como caminho principal e pull como rede de segurança:

1. **Push (principal).** `POST /webhooks/pagamentos`, `@Public()`, validado por
   `PAYMENT_WEBHOOK_TOKEN` em header — mesmo desenho do webhook do OpenWA, que
   já existe e serve de referência.
2. **Pull (rede de segurança).** `GET /api/v1/webhooks/events` lista os eventos
   da nossa company. Um job varre o que chegou desde o último cursor, a cada 15
   min. **Ele não é opcional**: webhook cai, URL muda, deploy derruba o endpoint
   por dois minutos — e nenhuma dessas três coisas pode custar uma baixa.

> **O formato do payload do repasse ainda precisa ser visto na prática.** Nosso
> endpoint aceita o envelope do Asaas (`id`, `event`, `payment{…}`) e também um
> envelope que embrulhe isso, procurando o `payment` em profundidade. Campo
> desconhecido é ignorado, nunca derruba o processamento — a própria API deles
> usa `@JsonIgnoreProperties(ignoreUnknown = true)` pelo mesmo motivo. Primeira
> coisa a fazer na fase 4: registrar a URL em ambiente de teste e **gravar um
> payload real** como fixture do nosso teste.

Disciplina do nosso lado, igual à do OpenWA:

- **Responder 200 rápido** e processar na fila. Webhook que processa em linha é
  webhook que o remetente considera falho por timeout.
- **Deduplicar por id do evento** (`assinatura_webhook_eventos`), com índice
  único. Evento repetido é normal e não pode dar baixa duas vezes.
- **Fora de ordem é normal**: `RECEIVED` pode chegar antes de `CONFIRMED`.
  Nunca voltar de `paga` para `aberta` por evento antigo — comparar por
  precedência de estado, não por ordem de chegada.
- Evento de fatura desconhecida → registrar e ignorar, sem erro. Pode ser
  cobrança de outro sistema na mesma company.

---

## 8. Reconciliação — o webhook que se perdeu

Job diário (BullMQ, `cron`), porque **nenhuma integração de dinheiro pode
depender só de evento**:

1. Seleciona faturas com `cobranca_id` e status não terminal.
2. `GET /api/v1/charges/{id}` de cada uma (paginado por `dueDateFrom/To` quando
   o volume crescer).
3. Divergência → aplica o estado do gateway e **registra em `audit_log`** com o
   antes e o depois.
4. Fatura sem `cobranca_id` há mais de 24h → alerta na tela do superadmin.

A API oferece `POST /admin/reconciliation/charges`, que faria o passo 2 numa
chamada só. **Ela entra como acelerador, não como base.** O motivo é o estado da
resposta que temos: "acredito que sim" sobre um endpoint `HOLDING_ADMIN`
cross-tenant. Construir a reconciliação em cima de um talvez é trocar uma
garantia por uma economia de código — e é justamente a rotina que existe para
quando o resto falhou.

Ordem prática: a varredura por `GET /charges/{id}` é escrita primeiro e fica
para sempre; se o endpoint de reconciliação estiver liberado para a nossa
company, ele vira um atalho ligado por env, com o mesmo resultado.

### O que a fase 4 mudou deste combinado

**A conciliação absorveu o "pull de eventos" (§ 7.2), que não foi implementado
como via separada.** Dois fatos apareceram na implementação:

1. `GET /webhooks/events` devolve o **evento** (`processedResourceId`,
   `processingSummary` em texto livre), não o **estado da cobrança**. Saber o
   status exigiria um `GET /charges/{id}` de qualquer forma — o pull não
   economizava a chamada que ele deveria economizar.
2. Reler a cobrança é **estritamente mais confiável** que reprocessar um log de
   eventos: lê a verdade de agora, sem depender de nenhum evento ter sido
   registrado do lado de lá.

O que se perderia era latência, então a varredura passou a rodar **de hora em
hora** em vez de uma vez por dia — a mesma janela que o pull de 15 min cobriria,
na ordem de grandeza que importa (uma fatura por cliente por mês). O volume
permite: são só as faturas não terminais.

O agendamento é **repeatable do BullMQ**, não `@nestjs/schedule`: aquele pacote
não está no projeto, e o repeatable é coordenado pelo Redis — com duas réplicas,
um cron em processo rodaria a conciliação duas vezes.

**`paga` deixou de ser terminal.** No plano ela contaria como estado final;
implementando ficou claro que estorno e chargeback chegam **depois** da baixa, e
esse é justamente o caso em que perder o webhook custa caro (o cliente aparece
adimplente com o dinheiro já devolvido). O que limita o volume da varredura é a
janela de vencimento, não cortar as pagas.

O acelerador `POST /admin/reconciliation/charges` continua **não implementado**,
pelo motivo original: seguimos sem confirmação de que ele responde para a nossa
company, e a rotina que existe para quando o resto falhou não se constrói sobre
um talvez.

---

## 9. Bloqueio por inadimplência

**Decisão: trava a escrita, leitura livre.** `GET` passa; `POST`/`PATCH`/`PUT`/
`DELETE` respondem **402 Payment Required** com o motivo e o link de pagamento.

### 9.1 Como funciona

`AcessoAssinaturaGuard`, global, **depois** do `JwtAuthGuard` e do
`TenantScopeGuard` (ele precisa saber quem é o cliente):

```
método é leitura?           → passa
rota isenta?                → passa
superadmin?                 → passa (a plataforma não se bloqueia)
quem paga por este usuário? → responsavelPeloCondominio()
status em cache?            → usa
                            → GET /customers/{id}/access-status (TTL 5 min)
allowed === false?          → 402 { motivo, valorEmAberto, linkPagamento }
API fora do ar?             → PASSA (fail-open)
```

**Rotas isentas** (senão o cliente não consegue nem pagar):

- `/auth/*` — login precisa funcionar, é onde ele descobre o bloqueio
- `/assinatura*` e `/minha-administradora/assinatura*` — inclusive os POSTs que
  gerarem link/2ª via
- `/health`
- Tudo do `superadmin`

**Fail-open é inegociável.** Gateway fora não pode virar cliente sem sistema: o
prejuízo de deixar um inadimplente trabalhar um dia é menor que o de travar
todos os adimplentes numa queda nossa. Fail-open + log + alerta.

**Cliente recém-criado, sem cobrança nenhuma, responde `allowed: true`**
(confirmado). Então o guard pode ser ligado sem exceção para cliente novo — e
cliente que ainda nem foi sincronizado com o gateway cai no mesmo fail-open, o
que dá o mesmo resultado pelo caminho seguro.

### 9.2 O ponto de atenção que eu levantei e você decidiu manter

Com escrita travada, **registrar encomenda também para** — é `POST /encomendas`.
Na prática a portaria para, e quem sente primeiro é o morador, que não deve nada.

Você optou por isso conscientemente. Deixo o plano com **dois amortecedores
prontos, desligáveis por configuração**, para você decidir depois sem refazer
nada:

| Amortecedor | Onde se ajusta |
|---|---|
| **Tolerância em dias** antes de travar (`overdueToleranceDays`) | política de acesso, na tela do superadmin |
| **Quantas faturas vencidas** até travar (`maxOverdueCharges`) | idem |
| **Lista de rotas isentas** (ex.: manter `POST /encomendas` liberado) | constante no guard, uma linha |

Recomendo subir com tolerância de 5 dias e `maxOverdueCharges = 1`: o cliente
que esquece o boleto não fica sem portaria na segunda-feira de manhã.

### 9.3 A política do lado deles

`PUT /api/v1/access-policy`, na instalação e editável pela tela:

```json
{
  "blockOnStandaloneCharges": true,   // ← sem isto, nada bloqueia
  "blockOnSubscriptionCharges": false,
  "blockOnSuspendedSubscription": false,
  "maxOverdueCharges": 1,
  "overdueToleranceDays": 5,
  "cacheTtlMinutes": 5,
  "customBlockMessage": "Assinatura do Chegou em atraso. Regularize para voltar a registrar encomendas."
}
```

Atenção documentada na referência: **mudança de política não invalida o cache
existente** — o efeito só aparece depois do TTL. A tela precisa dizer isso.

### 9.4 O que a fase 5 acrescentou ao combinado

**Um interruptor que nasce desligado: `PAYMENT_BLOQUEIO_ATIVO`.** O plano não
previa nada disso, e implementar deixou claro que faltava: este é o único ponto
do sistema capaz de tirar clientes adimplentes do ar, e sem um interruptor
próprio o bloqueio começaria a valer **no mesmo instante em que o código sobe** —
sem ninguém ter conferido a política do gateway, os clientes sincronizados ou as
faturas em aberto.

Ele também é o freio de mão: desligar não precisa de deploy. Os amortecedores da
§ 9.2 continuam existindo, mas todos dependem do gateway estar configurado do
jeito certo; este não depende de nada.

A ordem para ligar (documentada no módulo Pagamentos): Pendências vazia →
política salva e sincronizada com `bloquearAvulsas` → tolerância de 5 dias →
`PAYMENT_BLOQUEIO_ATIVO=true`.

**Fail-open ganhou um caminho que o plano não listava**: o próprio provider não
resolver. Um guard **global** que lança na injeção derruba toda escrita do
sistema com 500 — e foi o teste que encontrou isso, não a leitura do código.

**A tabela é de linha única por CHECK** (`CHECK (id = 1)`), não por disciplina:
somos uma company só no gateway, e uma segunda linha faria a tela mostrar uma
política e a API usar outra.

---

## 10. Migrations

Na ordem, cada uma reversível:

| # | O que faz |
|---|---|
| 1 ✅ | `assinatura_faixas` ganha `tipo_cliente` (`condominio` \| `administradora`), com as faixas atuais marcadas como `condominio` e a de administradora (1,99) inserida. Índice único `(tipo_cliente, ordem)` — **`028_assinatura_faixas_por_tipo.sql`** |
| 2 ✅ | Corte novo da primeira faixa de condomínio (50 → 100) — saiu junto na 028, e **só onde o superadmin não tinha mexido**: negociação dele vale mais que o nosso padrão |
| 3 ✅ | `tenants.cnpj` → `tenants.documento`; idem em `administradoras`. Mantém `varchar(14)`, sem formatação — **`029_documento_cliente.sql`**, com o CHECK antigo de 14 dígitos derrubado (ele recusaria todo CPF) e o novo entrando `NOT VALID` |
| 4 ✅ | `assinatura_clientes_gateway` (tenant XOR administradora, `customer_id`, `documento_enviado`, `sincronizado_em`, `erro_ultima_sync`) — **`030_assinatura_clientes_gateway.sql`**. `customer_id` saiu **nullable**: a linha também registra a tentativa que falhou, que é o que alimenta Pendências. Ganhou um índice único em `customer_id`, que não estava previsto — sem ele, dois clientes nossos apontando para o mesmo customer fariam a inadimplência de um bloquear o outro na fase 5 |
| 5 ✅ | `assinatura_faturas` ganha `cobranca_id`, `cobranca_asaas_id`, `cobranca_status`, `cobranca_status_gateway`, `cobranca_idempotency_key`, `invoice_url`, `pago_em`, `sincronizado_em` |
| 6 ✅ | `StatusFatura` ganha `estornada` e `em_disputa` (CHECK atualizado). **Saiu junto da 5, na mesma `031_fatura_cobranca.sql`**: separadas, existiria um intervalo em que o código já grava `estornada` e o CHECK ainda recusa — e um evento de estorno chegando nele derrubaria o processamento |
| 7 ✅ | `assinatura_webhook_eventos` (id do evento único, payload bruto, status, tentativas, `processado_em`) — **`032_webhook_eventos_pagamento.sql`** |
| 8 ✅ | `assinatura_politica_acesso` — espelho local do que foi enviado à API — **`033_politica_acesso_assinatura.sql`**. Linha única (`CHECK (id = 1)`): somos uma company só, e duas linhas fariam a tela mostrar uma política e a API usar outra |
| 9 ✅ | `assinatura_cupom_cliente` — **`034_cupom_assinatura.sql`** |
| 10 ✅ | `assinatura_faturas` ganha `cupom_codigo` e `cupom_desconto` — saiu junto da 9, na mesma migration. Sem elas, uma fatura com cupom seria indistinguível de uma fatura com preço errado |

**Nenhuma toca fatura já emitida.** Valor, quantidade, modo e preço aplicado
continuam sendo fotografia.

---

## 11. Rotas novas e perfis

Seguindo a regra de ouro do projeto — perfis definidos antes de escrever:

| Rota | superadmin | admin | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| `GET/PUT /admin/assinaturas/faixas?tipo=` ✅ *(no ar)* | ✅ | — | — | — |
| `GET/PUT /admin/assinaturas/politica-acesso` ✅ *(no ar)* | ✅ | — | — | — |
| `POST /admin/assinaturas/faturas/:id/emitir-cobranca` ✅ *(no ar)* | ✅ | — | — | — |
| `POST /admin/assinaturas/cobrancas/reemitir` ✅ *(no ar)* — varredura, não uma fatura por vez: o caso real é o gateway ter passado a manhã fora | ✅ | — | — | — |
| `GET /admin/assinaturas/cobrancas/pendencias` *(fase 3: fatura sem cobrança, erro de emissão)* | ✅ | — | — | — |
| `POST /admin/assinaturas/clientes/:tipo/:id/sincronizar` ✅ *(no ar)* | ✅ | — | — | — |
| `GET /admin/assinaturas/clientes/pendencias` ✅ *(no ar)* | ✅ | — | — | — |
| `GET/POST /admin/assinaturas/cupons` · `/:id/desativar` · `/reativar` ✅ *(no ar)* | ✅ | — | — | — |
| `POST /admin/assinaturas/cupons/atribuir` · `/remover` ✅ *(no ar)* | ✅ | — | — | — |
| `GET /assinatura/faturas/:id/pagamento` ✅ *(no ar)* | — | — | ✅ | — |
| `GET /minha-administradora/assinatura/faturas/:id/pagamento` ✅ *(no ar)* | — | ✅ | — | — |
| `POST /webhooks/pagamentos` ✅ *(no ar)* | *público, validado por token* ||||

As duas rotas de `/pagamento` devolvem o `invoiceUrl` e o estado da cobrança —
**não emitem nada**. Cliente não opera cobrança; ele paga o que foi emitido. Se
não houver link (erro na emissão), a resposta diz para procurar o suporte, em vez
de mostrar botão que não funciona.

As rotas de cupom são **proxy** para a Payment API: listar, criar e desativar
acontecem lá, e o nosso banco guarda só a atribuição (qual cliente usa qual
código). **Não há rota de cupom para o cliente** — ele não digita código em
lugar nenhum; quem concede é o superadmin, como já é com preço especial.

`@RequiresModule` não se aplica: assinatura não é módulo opcional.

---

## 12. Telas

| Tela | Quem | O que ganha |
|---|---|---|
| `SuperAdminAssinaturas` | superadmin | Aba **Preços** vira duas tabelas (condomínio / administradora), com o `SegmentedFilter` para trocar. Aba **Faturas** ganha coluna de cobrança (emitida / erro / paga) e as ações de emitir e reemitir |
| `SuperAdminAssinaturas` → **Pendências** (nova aba) | superadmin | Cliente sem documento, cobrança com erro, fatura sem cobrança há mais de 24h, divergência da reconciliação. É a tela que impede o silêncio |
| `SuperAdminAssinaturas` → **Política de acesso** | superadmin | Tolerância, quantidade de faturas, mensagem de bloqueio. Com o aviso do cache de 5 min |
| `Assinatura` (cliente) | admin, sindico | Botão **Pagar** na fatura em aberto, abrindo o `invoiceUrl`. Estado da cobrança em linguagem de gente |
| Faixa de bloqueio | admin, sindico, porteiro | Quando bloqueado, faixa vermelha fixa com valor, vencimento e link. O 402 do backend vira essa faixa, não um toast genérico |
| `SuperAdminAssinaturas` → **Cupons** (nova aba) | superadmin | Lista, cria e desativa cupons (na API), e atribui a um cliente. Mostra `usageCount`/`maxUses` e `currentlyValid`, que vêm de lá |
| `AssinaturaCondominioPanel` | superadmin, admin | Mostra o cliente no gateway, a última sincronização e o cupom vigente. Para a administradora é leitura, como já é o preço especial |

Tudo isso usando o que o catálogo já define
([components/ui](../web/src/components/ui/CLAUDE.md)): `ListCard` com ação em
ícone, `SegmentedFilter` para os dois tipos de faixa, `StatCard` com a variante
por significado, `FormDialog` com rodapé de uma linha.

---

## 13. Testes

**Sem teste, isto não sobe** — é dinheiro e é acesso ao sistema.

| Onde | O que prova |
|---|---|
| `calculadora-assinatura.spec.ts` (existente) | Ganha os casos de faixa por tipo: 100/101/200/201 no condomínio e o preço único da administradora |
| `payment-api.client.spec.ts` | Retry só em 5xx, 409 tratado como sucesso, refresh no 401 uma única vez, timeout |
| `cobrancas.service.spec.ts` | **A mesma `Idempotency-Key` no retry.** É o teste que impede cobrança dupla |
| `webhook.processor.spec.ts` | Evento repetido não dá baixa duas vezes; evento fora de ordem não desfaz `paga`; evento de fatura desconhecida não quebra |
| `cupons.service.spec.ts` | **O valor enviado ao gateway é o SEM cupom** (desconto duplo é o bug mais fácil daqui); divergência entre o `finalValue` do validate e o `value` da cobrança não emite; 422 de cupom expirado recalcula sem cupom; líquido zero não vira cobrança |
| `acesso.service.spec.ts` | Fail-open com a API fora; TTL do cache; condomínio de carteira segue a administradora |
| `test/pagamentos.e2e-spec.ts` | Fluxo inteiro contra um mock da Payment API: gerar → emitir → webhook → paga → desbloqueia |
| `test/acesso-bloqueio.e2e-spec.ts` | GET passa e POST toma 402 em cliente bloqueado; rotas isentas passam; superadmin nunca bloqueia |

O mock da Payment API é um `nock`/servidor local com os payloads **copiados da
referência** — contrato mudou, teste quebra.

---

## 14. O que pode dar errado (e a resposta de cada um)

| Risco | Resposta |
|---|---|
| **Cobrança duplicada** | `Idempotency-Key` persistida, gerada uma vez; emissão só para fatura em `pendente`/`erro`; 409 tratado como sucesso |
| **Cliente paga e continua bloqueado** | `CONFIRMED` já libera; cache de 5 min; webhook invalida o cache na hora |
| **Webhook perdido** | Reconciliação diária + pull dos eventos |
| **Gateway fora no dia da geração** | Geração é local; emissão é fila com retry |
| **Gateway fora e cliente bloqueado** | Fail-open no guard |
| **Cliente sem documento** | Fatura sai, cobrança não; entra em Pendências |
| **Valor divergente entre nós e o gateway** | Reconciliação compara `value`; divergência é alerta, nunca correção automática |
| **Estorno/chargeback** | Status próprios, fora dos totais, visíveis para o superadmin |
| **Trocar a tabela de preços** | Não toca fatura emitida — regra já existente |
| **Condomínio de carteira** | Não vira customer, não recebe cobrança, e o bloqueio dele segue a administradora |
| **Portaria travada por inadimplência** | Tolerância + `maxOverdueCharges` + lista de rotas isentas (§ 9.2) |
| **Cupom descontado duas vezes** | Mandamos o valor **sem** o cupom + o código; nunca o valor já descontado. Teste dedicado |
| **Fatura e cobrança com valores diferentes por cupom** | Validamos o cupom **antes** de gravar a fatura e conferimos o valor devolvido pela cobrança; divergência não emite |
| **Cupom expira entre validar e cobrar** | 422 → recalcula sem cupom e emite, com registro no `audit_log`. Só vale enquanto a cobrança não foi emitida |
| **Cupom zera a fatura** | Líquido zero não vira cobrança: fatura nasce `paga` com o motivo. Cortesia total é condição `valor_fixo = 0`, não cupom (`PERCENTAGE` é limitado a 90%) |

---

## 15. Fases

| Fase | Entrega | Dá para faturar? |
|---|---|---|
| **1 — Fundação** ✅ | Migrations 028 e 029, faixas por tipo, documento CPF/CNPJ, tela de preços com duas tabelas, testes da calculadora | Não, mas o preço já é o novo |
| **2 — Cliente no gateway** ✅ | `payment-api.client`, login/refresh, `customers`, migration 030, sincronização e aba de pendências | Não |
| **3 — Cobrança** ✅ | Migration 031, emissão em fila, `invoiceUrl` na tela do cliente, baixa e cancelamento espelhados | **Sim** |
| **4 — Conciliação** ✅ | Migration 032, webhook com token, conciliação **horária** (que substituiu o pull de eventos — ver § 8), auditoria | Sim, com garantia |
| **5 — Bloqueio** ✅ | Migration 033, política de acesso, guard 402, faixa de bloqueio no front — **e um interruptor que nasce desligado** (ver § 9.4) | Sim, com cobrança de verdade |
| **6 — Cupom** ✅ | Migration 034, validação **na emissão** (não na geração — ver abaixo), aba de cupons, atribuição por cliente | Sim, com campanha |

Fase 3 é o mínimo que já cobra. Não recomendo parar nela: sem a fase 4, uma
falha de webhook vira cliente pagante marcado como devedor.

**Por que o cupom é a fase 6 e não a 2.** Ele toca o cálculo (`valor_liquido`),
a emissão (validar antes de gravar) e a conferência (o valor devolvido tem de
bater) — as três coisas que a fase 3 acabou de estabilizar. Entrar antes disso
significa depurar desconto e integração ao mesmo tempo, sem saber de qual dos
dois veio o centavo que não fecha. **Cortesia total (`valor_fixo = 0`) não
espera a fase 6** — ela já funciona hoje, sem gateway nenhum.

---

## 16. Decisões tomadas

| # | Pergunta | Resposta | Efeito no plano |
|---|---|---|---|
| 1 | A Payment API repassa evento? | **Sim**, URL de webhook cadastrada no painel dela | Push é o caminho principal (§ 7); o pull vira rede de segurança, e continua obrigatório |
| 2 | `POST /admin/reconciliation/charges` é nosso? | "Acredito que sim" | Entra como **acelerador opcional**; a varredura por `GET /charges/{id}` é a base (§ 8) |
| 3 | Existe `ROLE_SYSTEM` para nós? | **Não** — usuário criado dentro da Payment API | Usuário `COMPANY_ADMIN` de integração, credenciais em env (§ 5.1) |
| 4 | `access-status` de cliente novo? | **`allowed: true`** | Guard pode ser ligado sem exceção para cliente novo (§ 9.1) |
| 5 | Cupom de desconto? | **Sim, queremos** | Vira a fase 6, com as duas armadilhas mapeadas (§ 3.4) |

### O que ainda falta descobrir (e não bloqueia começar)

1. **O formato exato do payload do repasse de webhook.** Resolve-se registrando
   a URL em ambiente de teste e gravando um evento real como fixture. É a
   primeira tarefa da fase 4, não um impedimento.
2. **Se `POST /admin/reconciliation/charges` responde para a nossa company.** Um
   `curl` responde; enquanto não responder, a reconciliação já funciona sem ele.
3. **Se o cupom de escopo `CHARGE` respeita `applicationType`/`recurrenceMonths`.**
   A semântica de "primeira cobrança" e "recorrente por N meses" é descrita em
   cima de assinatura, e nós não usamos assinatura. Se for ignorado, o controle
   de "quantos meses o desconto vale" é o `maxUsesPerCustomer` — que já resolve
   os casos da tabela em § 3.4. Vale confirmar antes de anunciar uma campanha
   de "3 meses com desconto" para o cliente.
