# Módulo: Assinaturas

O que o **cliente paga pelo Chegou** — não confundir com o módulo Vagas, que
cobra o morador pelo aluguel de vaga. Aqui a plataforma cobra quem usa o sistema.

> **Estado: completo.** Dados, cálculo, rotas do superadmin, visão do cliente,
> aviso de vencimento no painel — e o gateway de pagamento inteiro, das faixas
> por tipo ao cupom (fases 1 a 6 do
> [plano](../../../docs/plano-cobranca-gateway.md)).
>
> ⚠️ **O bloqueio nasce desligado** (`PAYMENT_BLOQUEIO_ATIVO=false`). A ordem
> para ligar está no [módulo Pagamentos](../pagamentos/CLAUDE.md).
>
> **Falta**: o aviso de vencimento por WhatsApp, que depende de uma sessão da
> plataforma.
>
> A regra que atravessa tudo: **a fatura continua nossa, o gateway só cobra** —
> sem `subscriptions`, com cobrança avulsa por fatura e correlação por
> `externalReference`. Mexeu no cálculo ou no status da fatura? Confira no plano
> se a mudança não contradiz o combinado.

## Rotas e perfis

| Rota | superadmin | admin | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| `/admin/assinaturas/*` | ✅ | — | — | — |
| `/minha-administradora/assinatura` | — | ✅ | — | — |
| `/minha-administradora/condominios/:tenantId/assinatura` | — | ✅ (leitura) | — | — |
| `/assinatura` | — | — | ✅ | — |

**O porteiro não entra em nenhuma**: a conta do condomínio não é assunto de
portaria.

**A administradora não usa `/assinatura`.** A conta dela é a da carteira, não a
de um condomínio — daria a impressão de que cada condomínio tem uma fatura, que
é exatamente o contrário da regra deste módulo. O que ela abre por condomínio
(`/minha-administradora/condominios/:tenantId/assinatura`) é **quanto aquele
condomínio pesa na conta dela** e o histórico dele, sempre em leitura: não há
fatura própria ali para operar.

### Plataforma — `/admin/assinaturas`

Todas `@Roles('superadmin')`; é a receita do Chegou. **Não há `X-Tenant-Id`
aqui**: o recorte não é o condomínio da request, é o cliente escolhido em cada
rota.

| Rota | O que faz |
|---|---|
| `GET /faixas?tipo=` · `PUT /faixas?tipo=` | Lê e substitui a tabela de preços **de um tipo de cliente** (lista completa). O `tipo` é obrigatório |
| `GET /previas` | Quanto entra se o mês fechar hoje, cliente a cliente |
| `GET /previas/condominio/:id` · `/administradora/:id` | A conta de um cliente |
| `GET /condominios/:tenantId` | A aba "Assinatura" de um condomínio, inteira (ver abaixo) |
| `PATCH /condominios/:tenantId/vencimento` | Dia negociado com aquele condomínio (`null` volta ao padrão) |
| `GET /condicoes` · `POST /condicoes` | Preço especial: histórico e negociação nova |
| `POST /condicoes/:id/encerrar` | Cliente volta para a tabela da plataforma |
| `POST /faturas/:id/emitir-cobranca` | Emite agora (caminho de conserto; o normal é a fila) |
| `POST /cobrancas/reemitir` | Reenfileira tudo que ficou sem cobrança |
| `POST /cobrancas/conciliar` | Confere agora contra o gateway (a rotina já roda de hora em hora) |
| `GET /cobrancas/pendencias` | Fatura sem cobrança há 24h e baixa não confirmada |
| `GET /politica-acesso` · `PUT /politica-acesso` | A política de bloqueio por inadimplência |
| `GET /cupons` · `POST /cupons` · `POST /cupons/:id/desativar` · `/reativar` | Cupons (**proxy** da Payment API) |
| `GET /cupons/atribuicoes` · `POST /cupons/atribuir` · `/remover` | Quem usa qual cupom (esta parte é nossa) |
| `GET /clientes/pendencias` | Quem hoje **não** poderia ser cobrado, e por quê |
| `POST /clientes/:tipo/:id/sincronizar` | Cria/atualiza o cliente no gateway de pagamento |
| `GET /resumo` | Cards: faturado, recebido, em aberto, vencido |
| `GET /faturas` · `GET /faturas/:id` | Faturas emitidas, com a composição |
| `POST /faturas/gerar` | Emite as faturas da competência (idempotente) |
| `POST /faturas/:id/pagar` · `/cancelar` | Baixa manual e cancelamento |

### Cliente

| Rota | Perfil | O que devolve |
|---|---|---|
| `GET /minha-administradora/assinatura` | admin | A conta da carteira + o histórico + o `aviso` |
| `GET /minha-administradora/assinatura/faturas/:id` | admin | Uma fatura da carteira |
| `GET /assinatura` | sindico | A conta do condomínio + o histórico + o `aviso` |
| `GET /assinatura/faturas/:id` | sindico | Uma fatura do condomínio |
| `GET /assinatura/faturas/:id/pagamento` | sindico | Link e estado da cobrança — **não emite nada** |
| `GET /minha-administradora/assinatura/faturas/:id/pagamento` | admin | Idem, para a carteira |
| `GET /minha-administradora/condominios/:tenantId/assinatura` | admin | A conta de **um condomínio da carteira**, em leitura |

**O id do cliente nunca vem da URL**: da administradora sai de
`@AdministradoraId()`, do condomínio sai de `@TenantId()`. Nas rotas de `:id` de
fatura, o service confere o dono e responde **404 — não 403** quando a fatura é
de outro: quem não é dono não pode nem descobrir que ela existe. Isso está
provado em `test/assinaturas-cliente.e2e-spec.ts`.

A rota nova é a única com um `:tenantId` no path, e ela **não** foge dessa
regra: o `:tenantId` diz *qual* condomínio, mas a carteira continua saindo de
`@AdministradoraId()` — `assertCondominioDaCarteira()` confere um contra o outro
e responde 404 (não 403) para condomínio de outra carteira. Ela também não passa
pelo `X-Tenant-Id`: a administradora abre a aba de um condomínio sem "entrar"
nele.

Nenhuma rota do cliente escreve. Dar baixa, cancelar e mexer em preço é só do
superadmin — o cliente vê a conta, não a opera.

## A regra que não pode quebrar

**Um condomínio é cobrado uma vez só.** Quem decide é o vínculo:

| Situação | Sacado | Faixa calculada sobre |
|---|---|---|
| `tenants.administradora_id IS NULL` | o próprio condomínio | os apartamentos dele |
| Condomínio em carteira | a **administradora** | a soma da carteira inteira |

Condomínio de carteira **não** aparece em `listarPrevias()` — ele está dentro da
fatura da administradora. `responsavelPeloCondominio()` responde quem paga por
um condomínio; é o que permite a tela do síndico dizer "a cobrança é com a sua
administradora" em vez de mostrar uma fatura vazia.

### A conta de **um** condomínio (`contaDoCondominio`)

É a resposta única que a aba "Assinatura" de um condomínio consome — a mesma
para o superadmin e para a administradora dona dele. Ela difere de
`minhaContaDoCondominio` (a do síndico) em dois pontos, que são o motivo de
existir:

1. **Traz a negociação**: histórico de preço especial e dia de vencimento. O
   síndico não vê isso; quem administra, sim.
2. **Não devolve conta vazia para condomínio de carteira.** Ali `conta` é `null`
   (ele não tem fatura própria) e o histórico vem em `participacoes`: as faturas
   da administradora em que ele entrou como item, com o subtotal dele ao lado do
   total da fatura. Sem isso a tela diria "nunca foi cobrado" sobre um
   condomínio que é cobrado todo mês.

`participacaoAtual` completa o par: quanto ele soma **hoje** na conta de quem
paga por ele — sai do item correspondente na prévia do responsável.

Vem tudo junto, e não em cinco rotas, porque a tela abre com tudo isso na mesma
pergunta: quanto custa, por quê, quando vence e o que já foi cobrado.

## Preço

Por **apartamento ativo** de **condomínio ativo**. Bloco não entra na conta: ele
organiza a unidade, não multiplica preço. Como no Chegou "remover é desativar",
unidade desativada sai da conta sozinha.

A faixa é escolhida pela quantidade e o preço dela vale para **todos** os
apartamentos — **não é escalonado por trecho**:

```
120 apartamentos → faixa de R$ 3,49 → 120 × 3,49 = R$ 418,80
             (e não 100 × 3,99 + 20 × 3,49 = R$ 468,80)
```

### São **duas** tabelas, uma por tipo de cliente

`assinatura_faixas.tipo_cliente` separa quem paga sozinho de quem paga pela
carteira (migration 028):

| `tipo_cliente` | Tabela | Para quem |
|---|---|---|
| `condominio` | 3,99 até 100 · 3,49 de 101 a 200 · 2,99 acima de 200 | condomínio direto (`administradora_id IS NULL`) |
| `administradora` | 1,99, faixa única sem teto | a carteira inteira |

**Quem escolhe a tabela é o vínculo do cliente, nunca a tela.** Por isso
`faixas(tipo)` não tem valor padrão e a rota exige o parâmetro: um padrão
silencioso faria a tela abrir mostrando os preços do outro tipo — e editar dali
substituiria a tabela errada.

A administradora ficou com **faixa única** porque o preço de atacado já é o
desconto; o modelo continua sendo faixa (e não uma coluna de preço solta) para
ela poder escalonar por volume um dia, sem migration de estrutura.

**Desconto por volume vale para a carteira**: três condomínios de 40 unidades
somam 120 na conta da administradora. Com a tabela própria dela isso não muda
mais o preço unitário, mas a soma continua sendo a base da contagem — é o que
faria diferença no dia em que a tabela da administradora tiver mais de uma faixa.

### Preço especial

`assinatura_condicoes` guarda o que foi negociado com **um** condomínio ou
**uma** administradora (CHECK garante que nunca os dois):

| `modo` | Efeito |
|---|---|
| `tabela` | faixas da plataforma (padrão) |
| `preco_apartamento` | preço por apto negociado, ignora as faixas |
| `valor_fixo` | valor fechado no mês, ignora a contagem |

`desconto_percentual` é aplicado **por último**, sobre qualquer modo. Só existe
uma condição em aberto por cliente (índice parcial); encerrar é preencher
`vigente_ate`, nunca apagar — o histórico explica por que a fatura de março saiu
diferente da de abril.

Criar uma condição nova **fecha a anterior na véspera**, na mesma transação: o
índice parcial só aceita uma em aberto, então gravar a nova antes de fechar a
velha estouraria a unicidade. Condição que começaria antes da que já está em
vigor é recusada — retroagir por cima do histórico apagaria a explicação de uma
fatura já emitida.

**Preço especial de condomínio de carteira é recusado.** Quem paga por ele é a
administradora, então a condição nunca seria aplicada — e ficaria a impressão de
que um desconto foi concedido.

## Dados

| Tabela | Papel |
|---|---|
| `assinatura_faixas` | Tabela de preços da plataforma, **uma por `tipo_cliente`** (índice único `(tipo_cliente, ordem)`) |
| `assinatura_condicoes` | Preço especial de um cliente (tenant XOR administradora) |
| `assinatura_faturas` | Fatura mensal (tenant XOR administradora) |
| `assinatura_fatura_itens` | Um item por condomínio — a composição do valor |
| `assinatura_clientes_gateway` | Vínculo com o `customer` do gateway (tenant XOR administradora) |
| `assinatura_politica_acesso` | Política de bloqueio (linha única, espelho do que foi ao gateway) |
| `assinatura_cupom_cliente` | Atribuição de cupom a um cliente (um em aberto por cliente) |
| `assinatura_webhook_eventos` | Eventos de pagamento recebidos — o índice único em `evento_id` é o que impede baixa dupla |

> **`assinatura_faturas.tenant_id` é NULLABLE de propósito** — terceira exceção
> deliberada do projeto, junto de `audit_log` e `whatsapp_messages`. A fatura da
> administradora não pertence a condomínio nenhum; quem faz o papel do
> `tenant_id NOT NULL` é o CHECK `chk_assinatura_faturas_sacado`.

A fatura guarda **quantidade, modo e preço aplicado**: mudar a tabela de preços
amanhã não pode reescrever o que já foi cobrado. O item guarda o **nome** do
condomínio (FK `SET NULL`), mesma disciplina do `locatario_nome` em Vagas.

### Emitir a fatura

`POST /admin/assinaturas/faturas/gerar` percorre `listarPrevias()` — é ela que
garante que nenhum condomínio seja cobrado duas vezes — e grava uma fatura por
cliente:

1. **Idempotente.** Os índices únicos `(tenant, competência)` e
   `(administradora, competência)` seguram até duas gerações simultâneas; rodar
   de novo só reporta `jaExistiam`.
2. **Fatura de R$ 0,00 não nasce.** Cliente sem apartamento ativo ainda não usa
   o sistema; cobrança zerada só atrapalha a leitura do mês. Ele volta em
   `ignorados`, com o motivo — o superadmin precisa saber por quê.
3. **Vencimento é no mês seguinte** (padrão dia 10, `DIA_VENCIMENTO_PADRAO`). A
   assinatura é pós-paga: a contagem de apartamentos só fecha quando o mês
   acaba, então cobrar dentro da própria competência seria cobrar um número que
   ainda vai mudar. **O dia não é um só para o lote** — ver abaixo.
4. **Fatura vencida vira `vencida` sozinha** na consulta, não por job — mesma
   escolha do módulo Vagas.
5. **Cancelada não entra em nenhum total**: não foi cobrada e não é dívida.

### Dia de vencimento negociado (`tenants.assinatura_dia_vencimento`)

Um condomínio pode ter o **próprio** dia (1–31, migration 027); `NULL` — o caso
da esmagadora maioria — segue o dia pedido na geração ou o padrão da plataforma.
Sem isso, atender o cliente que negociou "eu pago dia 5" exigiria gerar o lote
duas vezes com dias diferentes, e a idempotência impede exatamente isso.

Quatro decisões que não são óbvias:

1. **Coluna, não `config_json`.** Aquele JSONB é o operacional que o síndico e a
   administradora editam; vencimento é **contrato**, e contrato é do superadmin.
   A geração ainda lê o dia de todos os condomínios de uma vez
   (`diasDeVencimentoPorCondominio()`, uma consulta só) — num JSONB isso viraria
   filtro por chave.
2. **Só condomínio direto tem dia próprio.** Em condomínio de carteira o
   `PATCH` responde 400: a fatura da carteira é uma só para vários condomínios,
   então o dia dele nunca seria aplicado. Mesmo motivo pelo qual o preço
   especial dele é recusado.
3. **Não toca fatura já emitida** — o vencimento dela é fotografia, gravada na
   própria fatura. Vale da próxima geração em diante, e a tela precisa dizer
   isso.
4. **`null` é valor legítimo no DTO**, não campo ausente: é como o superadmin
   devolve o condomínio ao padrão. Por isso `DefinirDiaVencimentoDto` exige o
   campo e o `ValidateIf` libera só o `null` — omitir por engano não pode
   apagar em silêncio um combinado com o cliente.

Dia maior que o mês (31 em fevereiro) é encaixado no último dia pela mesma
`vencimentoDaCompetencia()` de sempre, coberta em `datas.spec.ts`.

### Trocar a tabela de preços

`PUT /faixas?tipo=` substitui a tabela **daquele tipo** por inteiro (não é
incremental) numa transação. A última faixa precisa ficar sem teto e os tetos
precisam crescer — sem faixa aberta no topo, um cliente maior que a tabela cairia
num preço por acaso. Nada disso toca fatura emitida.

> **A limpeza é filtrada pelo tipo.** Enquanto havia uma tabela só, o `delete`
> varria `assinatura_faixas` inteira. Com duas tabelas, esse mesmo `delete`
> apagaria a do outro tipo a cada edição — e o próximo cliente daquele tipo
> cairia em `TabelaDePrecosVaziaError` no fechamento do mês.

## O cliente no gateway de pagamento

Quem paga vira um `customer` na Payment API — e só quem paga: **condomínio de
carteira não vira cliente do gateway**, porque não é cobrado. Recusar isso é do
`AssinaturaClientesService`, e não do módulo Pagamentos: lá ele seria criado sem
reclamação, e o resultado seria um cliente existindo no Asaas que nunca recebe
cobrança — sujeira que só aparece meses depois, na conciliação.

A divisão com [Pagamentos](../pagamentos/CLAUDE.md): **lá se sabe falar com a
API, aqui se sabe quem é o cliente**. Este módulo monta o `ClienteParaGateway`
(nome, documento, contato, endereço) e entrega pronto.

> **O conjunto de clientes de `pendencias()` é o mesmo de `listarPrevias()`**:
> condomínio ativo e direto, mais administradora ativa. Se as duas seleções
> divergirem, aparece cliente faturado que nunca foi sincronizado — a pior
> combinação, porque a fatura existe e a cobrança não. Mexeu numa, confira a
> outra.

A avaliação de pendência é de **cadastro**, sem chamar o gateway: a tela precisa
abrir justamente quando a API de pagamento está fora do ar. O que depende de
rede é só o botão de sincronizar.

| Motivo | Onde se conserta |
|---|---|
| `sem_documento` · `documento_invalido` | No cadastro do cliente |
| `nunca_sincronizado` · `erro_sync` | No botão Sincronizar |
| Documento trocado depois de sincronizado | Cliente novo no gateway — documento não se altera lá |

## A fatura virando cobrança

**Gerar a fatura e emitir a cobrança são passos separados**, e isso não é
organização de código: a geração mensal é local e não pode depender de rede. Se
o gateway estiver fora no dia 1º, as faturas nascem do mesmo jeito e a emissão
fica na fila. Misturar os dois é como se perde um mês de faturamento por um
timeout.

```
gerar faturas (local) → cobranca_status = 'pendente'
                              │ fila BullMQ (cobranca-emissao)
                              ▼
              POST /charges/undefined  ──erro──► 'erro' + motivo na tela
                              │
                              ▼
              'emitida' + invoice_url  ◄── o cliente paga no link
```

### Idempotência em três camadas

Cobrar duas vezes é o pior defeito possível aqui, então há três travas e **as
três são necessárias**:

| Camada | O que segura |
|---|---|
| `jobId` do BullMQ | Enfileirar a mesma fatura duas vezes |
| `cobranca_status IN ('pendente','erro','desligada')` | Emitir uma fatura já emitida |
| `cobranca_idempotency_key` **persistida** | O retry depois de um timeout |

A chave é gravada **antes** do POST. Gerar e mandar sem gravar perderia a chave
num crash entre as duas coisas, e o retry criaria outra — que é exatamente como
se cobra o cliente duas vezes. Tem teste dedicado.

### Baixa e cancelamento têm ordens **opostas**

Não é inconsistência: é o risco de cada lado.

| Ação | Ordem | Se o gateway falhar |
|---|---|---|
| **Baixa manual** | local **primeiro**, gateway depois | A baixa vale assim mesmo; a fatura fica `cobranca_dessincronizada` e a conciliação resolve. **Dinheiro que entrou não fica refém de API fora do ar** |
| **Cancelar** | gateway **primeiro**, local depois | O cancelamento local **não acontece**. Cancelar só do nosso lado deixaria uma cobrança viva que o cliente pode pagar por engano |

### Dois status novos de fatura

`estornada` e `em_disputa` (migration 031) chegam do gateway, nunca de ação
nossa. Nenhum dos dois entra em `valorFaturado` — somar dinheiro devolvido ou em
disputa faria a receita do mês mentir. `atualizarVencidas()` não os alcança
porque filtra por `status = 'aberta'`, e uma fatura em disputa virando "vencida"
pelo calendário reabriria como dívida algo que está sendo contestado.

Baixa manual é recusada nos dois: em `estornada` o dinheiro voltou; em
`em_disputa` a baixa apagaria a disputa da tela, que é o oposto do que o status
existe para fazer.

### O que o cliente vê (`situacao-pagamento.ts`)

O cliente **não** vê `cobranca_status`, status bruto do gateway nem chave de
idempotência. Ele vê uma resposta só: **dá para pagar agora, e por onde?**

| Situação | Quando |
|---|---|
| `pagavel` | Emitida, com link, e a fatura ainda espera pagamento |
| `preparando` | Cobrança na fila (ou ambiente sem gateway) — **não é erro** |
| `sem_pendencia` | Paga, cancelada ou estornada |
| `indisponivel` | Erro na emissão, emitida sem link, **ou em disputa** |

Duas decisões que o teste guarda:

1. **"Já está resolvida?" vem antes de "tem link?"** O `invoiceUrl` continua
   gravado depois da baixa; invertendo a ordem, a tela mostraria "Pagar" numa
   fatura paga — convidando o cliente a pagar duas vezes.
2. **Disputa não oferece pagamento.** O link continua vivo no gateway, mas pagar
   no meio de um chargeback é como se paga duas vezes: se a disputa for resolvida
   a nosso favor, o valor volta e o cliente terá pago o mesmo mês duas vezes.

O bloco vem junto de **cada fatura** (campo `pagamento`) para o botão existir na
lista sem uma requisição por linha. A rota `/faturas/:id/pagamento` existe para
o caso da fatura recém-gerada, cuja emissão ainda está na fila — as duas leem o
mesmo `situacaoDePagamento()`, então não têm como divergir.

## O dinheiro chegando: webhook e conciliação

Duas vias, e a segunda existe porque **nenhuma integração de dinheiro pode
depender só de evento**.

### 1. Webhook (`POST /webhooks/pagamentos`)

`@Public()` — quem chama é outro sistema, sem JWT nosso. O que substitui a
autenticação é o `PAYMENT_WEBHOOK_TOKEN`, conferido com `timingSafeEqual`.

> **Sem o token configurado, a rota recusa tudo.** Um endpoint público que altera
> estado de fatura não pode ficar aberto porque alguém esqueceu de preencher uma
> variável de ambiente.

Quatro disciplinas no processamento:

1. **Gravar primeiro, processar depois.** Webhook que processa em linha é
   webhook que o remetente considera falho por timeout — e reenvia, multiplicando
   o trabalho justamente quando o sistema está lento.
2. **Deduplicar pelo id do evento**, com o **índice único do banco** e não com
   uma consulta antes do insert: duas entregas simultâneas passariam as duas pela
   consulta e as duas dariam baixa. A corrida só se resolve no `INSERT`.
3. **Fora de ordem é normal** — `RECEIVED` pode chegar antes de `CONFIRMED`. A
   comparação é por **precedência**, nunca por ordem de chegada.
4. **Fatura desconhecida não é erro.** Pode ser cobrança de outro sistema na
   mesma company: registra e ignora.

Corpo ilegível também responde 200 e fica guardado: devolver erro faria o
remetente reenviar para sempre um evento que repetição nenhuma conserta.

> O controller mora **aqui**, e não em Pagamentos como o plano previa: Assinaturas
> já importa Pagamentos, então um controller lá que precisasse do serviço de
> fatura fecharia um ciclo entre os módulos. O que importava foi preservado — o
> conhecimento do formato do gateway continua em `pagamentos/webhook-payload.ts`.

### 2. Conciliação (`ConciliacaoService`), de hora em hora

Relê no gateway o estado de **toda cobrança não terminal** e aplica o que
encontrar, registrando no `audit_log` com o antes e o depois.

**Ela substitui o "pull de eventos" que o plano previa**, e por dois motivos que
só apareceram implementando:

1. `GET /webhooks/events` devolve o **evento** (`processedResourceId`,
   `processingSummary` em texto livre), não o **estado da cobrança**. Saber o
   status exigiria um `GET /charges/{id}` de qualquer forma.
2. Reler a cobrança é **estritamente mais confiável** que reprocessar um log de
   eventos: lê a verdade de agora, sem depender de nenhum evento ter sido
   registrado do lado de lá.

Roda de hora em hora (não uma vez por dia) para cobrir a mesma latência que o
pull cobriria. O volume permite: são as faturas não terminais, uma por cliente
por mês.

O agendamento é **repeatable do BullMQ**, não `@Cron`: o repeatable é coordenado
pelo Redis, então duas réplicas produzem **uma** execução por hora. Com um cron
em processo, cada réplica consultaria o gateway pelas mesmas faturas.

**Divergência de valor é alarme, nunca correção automática.** A fatura é a fonte
da verdade do que o cliente deve; um valor diferente do outro lado indica regra
aplicada lá que a nossa conta não conhece, e ajustar em silêncio esconderia
exatamente o que precisa ser visto.

**`paga` não é estado terminal.** Parece e não é: estorno e chargeback chegam
depois da baixa, e é justamente o caso em que perder o webhook custa caro — o
cliente aparece adimplente com o dinheiro já devolvido.

## Cupom de desconto

O cupom vive no gateway ([Pagamentos](../pagamentos/CLAUDE.md)); aqui fica a
**atribuição** (`assinatura_cupom_cliente`: quem usa qual) e o que a fatura
registra dele.

### A armadilha que o desenho inteiro evita

**O desconto não pode nascer na cobrança.** Mandar só o `couponCode` e deixar a
API descontar faria a fatura dizer R$ 418,80 e a cobrança cobrar R$ 376,92 —
três coisas quebrariam de uma vez: o cliente veria na tela um número que não é o
que paga, o `resumo()` reportaria faturado maior que recebido **todo mês**, e a
conciliação acusaria divergência de valor. Um alarme falso mensal é a maneira
mais rápida de ninguém mais olhar para os alarmes.

A ordem tem três passos, e nenhum pode ser pulado:

```
1. validar  → discountAmount, finalValue
2. gravar na fatura: cupom_codigo, cupom_desconto, valor = finalValue
3. cobrar   → value = valor SEM o cupom + couponCode
              confere: charge.value == fatura.valor?
```

> **Mandamos o valor bruto + o código.** Mandar o valor já descontado *e* o
> código aplica o desconto **duas vezes**. Tem teste dedicado.

### Por que na emissão, e não na geração

Validar cupom é chamada de rede, e **a geração mensal não pode depender de
rede**. A fatura nasce pelo valor cheio; o cupom entra na emissão, que já é a
fila com retry. Isso é permitido porque ali ela ainda está em
`cobranca_status = 'pendente'` — nunca foi cobrada. Fatura **emitida** continua
sendo fotografia intocável.

Consequência visível: entre gerar e emitir, a tela do superadmin mostra o valor
cheio. É honesto — o desconto ainda não foi confirmado por ninguém.

### Os três desfechos que não são o caminho feliz

| Situação | O que acontece |
|---|---|
| Valor da cobrança ≠ valor da fatura | **Não emite.** Cancela a cobrança (o cliente poderia pagar um valor errado) e vira pendência |
| 422 na cobrança (cupom expirou entre validar e cobrar) | Recalcula **sem** o cupom e emite, com registro no `audit_log`. Chave de idempotência **nova**: a anterior está associada à tentativa recusada |
| Cupom zera a fatura | **Não vira cobrança** — o gateway não emite R$ 0,00. A fatura nasce `paga` com o motivo, e o histórico mostra o mês coberto em vez de um buraco |

### Cortesia total não é cupom

`PERCENTAGE` é limitado a 90% pelo gateway. Para isentar um cliente por
completo, o lugar é **preço especial com `valor_fixo = 0`** — e aí a regra que já
existe ("fatura de R$ 0,00 não nasce") resolve sozinha.

### `aplicar_ate` é o freio do nosso lado

O limite de uso é do gateway (`maxUsesPerCustomer` — e como cada fatura é uma
cobrança, **3 são três meses de desconto**). Mas "este cliente para de receber em
junho" é decisão comercial nossa, e mora na atribuição.

**Um cupom em aberto por cliente** (índice parcial), como `assinatura_condicoes`:
dois ativos exigiriam uma regra de desempate que ninguém lembraria seis meses
depois.

## Bloqueio por inadimplência

**Trava a escrita, leitura livre.** `GET` passa sempre; `POST`/`PATCH`/`PUT`/
`DELETE` respondem **402** com motivo, valor em aberto e o link de pagamento.

Quem sabe quem paga por uma request é este módulo — `AcessoAssinaturaImpl`
implementa o contrato que o guard global declara em `common/guards`. **A
inversão existe para `common/` não depender de um módulo de domínio**: aberta
essa porta, o próximo guard importaria Encomendas e o seguinte, Vagas.

A administradora é resolvida pelo **vínculo do usuário**, não pelo condomínio do
header: ela opera dentro de um condomínio da carteira, mas quem deve é ela. Já o
síndico e o porteiro dependem do condomínio — e se ele for de carteira, quem
paga é a administradora dele (`responsavelPeloCondominio()`).

### O que **nunca** é bloqueado

| | Por quê |
|---|---|
| `GET`/`HEAD`/`OPTIONS` | Leitura nunca trava |
| `/auth/*` | Login precisa funcionar: é onde ele descobre o bloqueio |
| `/assinatura*` e `/minha-administradora/assinatura*` | **É a saída** — onde está o link para pagar |
| `/health`, `/webhooks/*` | Monitoração e outros sistemas |
| superadmin | A plataforma não se bloqueia |
| Qualquer falha | Fail-open (ver abaixo) |

> A lista de isentas é o que impede o bloqueio de virar armadilha. Sem
> `/assinatura`, o cliente bloqueado não conseguiria abrir a tela onde está o
> link — e o único caminho de saída seria ligar para o suporte.

### A decisão consciente sobre a portaria

Com a escrita travada, **registrar encomenda também para** (`POST /encomendas`).
A portaria para, e quem sente primeiro é o morador, que não deve nada. Isso foi
aceito de olhos abertos (§ 9.2 do plano), com três amortecedores prontos:

1. `dias_tolerancia` na política (padrão **5**);
2. `max_faturas_vencidas` (padrão **1**);
3. a constante `ISENTAS` no guard — **uma linha** libera a portaria se um dia
   isso doer demais.

### O desbloqueio é imediato

Toda baixa (webhook, conciliação ou manual) limpa o cache de acesso do cliente.
Na baixa manual isso acontece **antes** de falar com o gateway e mesmo com ele
fora: cinco minutos olhando uma tela travada depois de ter pago é a pior
experiência que este sistema pode oferecer.

## Aviso de vencimento

`aviso-vencimento.ts` decide **se e como** o cliente é avisado, e vem junto da
conta (`GET /assinatura` e `GET /minha-administradora/assinatura`) — não numa
rota própria: quem abre a tela já carregou as faturas, e um endpoint só para
"tem aviso?" repetiria a mesma consulta.

| Situação | Quando | Cor |
|---|---|---|
| `vence_em_breve` | faltam de 1 a `DIAS_DE_ANTECEDENCIA` (3) dias | âmbar |
| `vence_hoje` | vence hoje | âmbar |
| `vencida` | o vencimento passou e ainda está em aberto | vermelho |

Três decisões que não são óbvias:

1. **Quem decide a situação é a data, não o `status`.** A fatura só vira
   `vencida` no banco quando alguém consulta (`atualizarVencidas()`); ler o
   status mostraria "em aberto" numa fatura que venceu ontem só porque ninguém
   passou por ali ainda.
2. **A fatura em destaque é a de vencimento mais antigo**, mesmo havendo várias
   em aberto — é a que corre há mais tempo. Pela mais recente, uma fatura de
   setembro esconderia a de agosto que vence hoje.
3. **"Vence hoje" ainda é âmbar.** Quem está dentro do prazo não deve ver a cor
   de erro por estar cumprindo o combinado.

O aviso é **só do painel**. Ele não passa pela fila de notificações e isso é
deliberado: aquela fila é do condomínio para o morador — `notificacoes.tenant_id`
é `NOT NULL`, a sessão do OpenWA é uma por condomínio e a cota diária existe para
proteger aquele número. Mandar cobrança da plataforma por ali gastaria a cota das
encomendas, e para cliente administradora não há sequer um número a usar. Aviso
por WhatsApp exige uma **sessão própria da plataforma** — é a segunda metade da
fase 4.

## Dinheiro anda em centavos

`calculadora-assinatura.ts` faz toda a conta em inteiros e converte só no fim.
Multiplicar float e arredondar no meio é como uma fatura de 200 apartamentos
fecha com um centavo a menos que a soma dos itens. No rateio de `valor_fixo`, a
sobra vai para o maior condomínio (desempate estável por id) — a soma dos itens
**sempre** bate com o total.

## Frontend

| Tela | Quem vê | Arquivo |
|---|---|---|
| Assinatura (a própria conta) | admin e sindico | `web/src/pages/Assinatura.tsx` |
| Assinaturas (a receita) | superadmin | `web/src/pages/SuperAdminAssinaturas.tsx` |
| Aba "Assinatura" de um condomínio | superadmin e admin | `components/condominio/AssinaturaCondominioPanel.tsx` |

O painel da aba é **um componente para dois perfis**, e quem decide é o
`podeEditar`: ele escolhe o endpoint (`/admin/assinaturas/condominios/:id` para
a plataforma, `/minha-administradora/condominios/:id/assinatura` para a
carteira) e libera preço especial e vencimento. A administradora vê o mesmo
conteúdo, sem os botões — a negociação é do superadmin. Ele é montado por
`SuperAdminTenant.tsx` e `MeuCondominio.tsx`.

`Assinatura.tsx` é **uma tela para dois perfis**: a pergunta é a mesma ("quanto
eu pago e por quê?"), muda de onde vem a resposta. Ela escolhe o endpoint pelo
`role` do `useAuthMe()`.

**A rota `/assinatura` é `semCondominio`.** A conta da administradora é a da
carteira, então ela precisa abri-la sem ter escolhido um condomínio antes — sem
isso o `ProtectedRoute` a mandaria para `/meus-condominios`.

O síndico de condomínio de carteira cai em `CobrancaEhDaAdministradora`, que diz
com quem é a cobrança. Sem essa tela ele veria uma página vazia e abriria chamado
achando que a fatura sumiu.

`ComoFoiCalculado` (em `components/assinatura/assinatura-shared.tsx`) mostra
quantidade × preço = valor. "R$ 191,95" sozinho não deixa ninguém conferir nada —
é a diferença entre confiar na fatura e ligar para o suporte.

`AvisoVencimentoFaixa` (mesmo arquivo) desenha a faixa de vencimento, e o mesmo
`aviso` vira um ponto colorido no item "Assinatura" do menu (`Layout.tsx`). Os
dois saem do hook `useMinhaAssinatura()` (`hooks/use-assinatura.ts`), que é
**uma query só**: fossem duas, o menu e a tela poderiam discordar sobre o mesmo
vencimento. O hook fica desligado para superadmin e porteiro, que não têm conta.

## Conferir sem tela

```bash
npm run assinatura:previa    # imprime o que cada cliente pagaria hoje
```

## Testes

| Onde | O que cobre |
|---|---|
| `calculadora-assinatura.spec.ts` | Fronteiras de faixa (100/101/200/201), o preço único da administradora, carteira somada, os três modos, desconto, arredondamento |
| `datas.spec.ts` | Vencimento no mês seguinte, dia 31 em mês curto, ano bissexto, véspera, distância entre datas |
| `aviso-vencimento.spec.ts` | A régua do aviso: 3 dias, no dia, atraso, qual fatura entra em destaque, total em aberto |
| `assinatura-cobrancas.service.spec.ts` | **A mesma `Idempotency-Key` no retry** (o teste que impede cobrança dupla); a chave gravada antes do POST; baixa que sobrevive ao gateway fora; cancelamento que **não** sobrevive |
| `webhook-pagamento.service.spec.ts` | **Evento repetido não dá baixa duas vezes**; `PENDING` atrasado não desfaz baixa; fatura desconhecida não quebra; status de origem duvidosa consulta o gateway |
| `conciliacao.service.spec.ts` | Alcança a baixa que o webhook perdeu; divergência de valor é alarme e não correção; `paga` continua sendo conferida |
| `test/webhook-pagamentos.e2e-spec.ts` | Por HTTP: a rota é pública, o token é conferido, e a dedup é do **índice único** |
| `cupom-fatura.service.spec.ts` | **Toda dúvida cobra o valor cheio**; `aplicar_ate` como freio; usa o `finalValue` deles |
| `situacao-pagamento.spec.ts` | A régua do que o cliente vê: paga com link não oferece "Pagar"; disputa também não; `pendente` é "preparando", não erro |
| `test/assinaturas.e2e-spec.ts` | O SQL: quem é o sacado, quais apartamentos contam, condição vigente vs. vencida, geração idempotente, baixa, que **trocar a tabela de um tipo não apaga a do outro** e que **a fatura nasce com a cobrança desligada** |
| `test/assinaturas-cliente.e2e-spec.ts` | O acesso, por HTTP: quem vê a própria conta, quem toma 404/403 tentando ver a de outro, e para quem o `aviso` chega |
| `test/multitenant.e2e-spec.ts` | A rota com `:tenantId` no path: a administradora lê a assinatura de um condomínio da carteira e toma 404 no de outra |

> O e2e gera na competência **2099-01** de propósito: a geração varre o banco
> inteiro, então precisa de um mês que não esbarre em dado real nem em outra
> rodada. Mexeu na geração? Confira que o `afterAll` continua limpando.

## Ao alterar este módulo

- [ ] Mexeu no cálculo → rode os três arquivos de teste acima. Fronteira de
      faixa é o que mais dói errado em produção.
- [ ] Mudou a tabela de preços → **não** mexa em fatura já emitida; o valor dela
      é fotografia. E lembre que são **duas** tabelas: toda leitura, escrita e
      limpeza de `assinatura_faixas` anda com o `tipo_cliente` junto.
- [ ] Campo novo na fatura → lembre que ela precisa se explicar sozinha daqui a
      um ano, sem depender das tabelas de configuração de hoje.
- [ ] Mexeu na seleção de clientes de `listarPrevias()` → mexa também em
      `pendencias()`. Cliente faturado que nunca foi sincronizado é fatura sem
      cobrança.
- [ ] Rota nova → superadmin em `/admin/assinaturas`; administradora em
      `/minha-administradora/...` (a carteira vem de `@AdministradoraId()`,
      nunca da URL — se houver `:tenantId` no path, confira com
      `assertCondominioDaCarteira()` e responda 404); síndico só vê a do próprio
      condomínio e só quando direto.
- [ ] Campo novo na aba do condomínio → ele entra em `ContaDoCondominio` (uma
      resposta só) e precisa fazer sentido **nos dois casos**: condomínio direto
      (tem `conta` e `faturas`) e de carteira (tem `participacoes`).
- [ ] Status novo de fatura → reveja `resumo()` (`FORA_DOS_TOTAIS`),
      `atualizarVencidas()`, o `EM_ABERTO` de `aviso-vencimento.ts`,
      `situacaoDePagamento()`, as guardas de `pagar()`/`cancelar()`, o mapa em
      `pagamentos/status-cobranca.ts` (incluindo a **precedência**) e
      `STATUS_FATURA_META` no front.
- [ ] Mexeu na emissão → as três camadas de idempotência continuam de pé? A
      chave ainda é gravada **antes** do POST?
- [ ] Mexeu no webhook → a dedup continua sendo o **índice único** (não uma
      consulta antes do insert), e a ordem continua sendo por **precedência**?
      `webhook-pagamento.service.spec.ts` cobre os dois.
- [ ] Campo novo no evento do gateway → some em `webhook-payload.ts`, com um
      caso no spec. Nunca faça o parser exigir um formato: o payload bruto fica
      gravado justamente porque o envelope pode mudar sem aviso.
- [ ] Mexeu na régua do aviso → `aviso-vencimento.spec.ts` cobre as fronteiras
      sem banco; o e2e só prova que o aviso chega ao dono certo. **Não use
      `CURRENT_DATE` no e2e**: o Postgres roda em UTC e o produto conta os dias
      em São Paulo — depois das 21h os dois discordam em um dia.
- [ ] Rota nova que recebe id de fatura → **confira o dono** com
      `obterDoTenant`/`obterDaAdministradora`. `obter(id)` cru não filtra nada.
