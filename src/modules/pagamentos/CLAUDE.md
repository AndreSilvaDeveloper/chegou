# Módulo: Pagamentos (gateway de cobrança)

Tudo que conversa com a **Payment API** (que por trás fala com o Asaas). O plano
completo, com as decisões e as fases, está em
[docs/plano-cobranca-gateway.md](../../../docs/plano-cobranca-gateway.md).

> **Estado: completo (fases 1 a 6).** Cliente no gateway, emissão em fila, link
> de pagamento, baixa e cancelamento espelhados, webhook, conciliação horária,
> bloqueio por inadimplência e cupom de desconto.
>
> ⚠️ **O bloqueio nasce DESLIGADO** (`PAYMENT_BLOQUEIO_ATIVO=false`). Ver
> "Ligar o bloqueio" abaixo antes de mexer nisso em produção.

## A fronteira deste módulo

**Ele fala com a API e não conhece regra de assinatura.** Não sabe o que é
faixa, fatura, carteira ou competência — recebe um cliente já resolvido e
devolve o vínculo. Quem sabe quem é o sacado e quanto ele deve é o módulo
[Assinaturas](../assinaturas/CLAUDE.md).

Na prática a divisão é esta:

| Pergunta | Quem responde |
|---|---|
| Quem paga por este condomínio? | Assinaturas (`responsavelPeloCondominio`) |
| Quanto ele deve neste mês? | Assinaturas (`listarPrevias`) |
| Como se cria um customer? | Pagamentos |
| O cliente pagou? | Payment API (fase 4) |

Por isso **não há controller aqui**: as rotas são do superadmin e vivem em
`/admin/assinaturas/...`. O webhook da fase 4 será a exceção — ele é público e
não tem dono do outro lado.

## Peças

| Arquivo | O que faz |
|---|---|
| `payment-api.client.ts` | HTTP puro: autenticação, retry, disjuntor, idempotência |
| `payment-api.types.ts` | Espelho dos DTOs da API (só o que usamos) |
| `clientes-gateway.service.ts` | O cliente do Chegou virando `customer` |
| `cobrancas.service.ts` | Emitir, cancelar, consultar e dar baixa numa cobrança |
| `status-cobranca.ts` | O mapa `ChargeStatus` → `StatusFatura`, precedência e terminais |
| `webhook-payload.ts` | Lê o evento **sem depender do envelope exato** |
| `acesso.service.ts` | O cliente pode usar o sistema? Cache + **fail-open** |
| `cupons.service.ts` | Proxy dos cupons — o cupom vive lá, não aqui |

## Configuração — vazio desliga

| Variável | Papel |
|---|---|
| `PAYMENT_API_BASE_URL` | **Vazio = cobrança desligada** |
| `PAYMENT_API_COMPANY_ID` | O `X-Company-Id` (somos uma company só) |
| `PAYMENT_API_KEY` | **Caminho principal**: chave sistema-a-sistema (`X-API-Key`) |
| `PAYMENT_API_EMAIL` / `_PASSWORD` | Usuário de integração (JWT), criado **no painel deles**. Reserva |
| `PAYMENT_API_TIMEOUT_MS` | Timeout de cada chamada (padrão 15000) |

Mesma disciplina do `OPENWA_BASE_URL`: dev e teste rodam sem gateway. A fatura
continua sendo gerada e calculada; só a cobrança não sai, e a tela **diz isso**
em vez de listar todo mundo como erro. Nada de mock silencioso.

Basta **uma** das duas credenciais para a integração ficar configurada. Se for
o usuário de integração, ele precisa ser **`COMPANY_ADMIN`**, não
`COMPANY_OPERATOR`: estorno, `received-in-cash` e escrita de cupom exigem admin.

## Autenticação — API Key primeiro, JWT como reserva

| Variável | Papel |
|---|---|
| `PAYMENT_API_KEY` | **Caminho principal.** Header `X-API-Key: pk_...`, criada no painel deles |
| `PAYMENT_API_EMAIL` / `_PASSWORD` | Usuário `COMPANY_ADMIN` (JWT). Reserva |

Com a chave configurada, **o ciclo de autenticação some**: nada de login,
refresh com rotação, trava entre réplicas ou token em Redis. Uma chamada HTTP por
operação — e menos peças no caminho de uma integração de dinheiro é menos coisa
para falhar às três da manhã.

### Por que o JWT continua aqui

**A referência deles se contradiz** sobre quais endpoints aceitam API Key: a
tabela-resumo do fim lista `/access-policy` e `access-status` como **JWT**, e a
seção de cada endpoint diz "JWT ou API Key".

Em vez de escolher uma das versões e torcer, o cliente **descobre na prática**:
401/403 com API Key, havendo credenciais, ele repete com JWT e registra um aviso
nomeando o caminho. A lista de exceções sai do log, não de um documento que
discorda de si mesmo.

O fallback acontece **uma vez** por chamada — 403 no JWT também não vira laço.

### Quando o JWT é usado

Só sem `PAYMENT_API_KEY`, ou no fallback acima. Nesse caminho valem as três
regras de sempre: o par de tokens vive no **Redis** (réplica não multiplica
sessão), o refresh **rotaciona** (daí a trava `pay:auth:lock`), e **refresh que
falha cai para login** — temos as credenciais, então rotação perdida nunca é beco
sem saída.

`expiresIn` vem em **milissegundos** (86400000 = 24h). Tratar como segundos
guardaria o token por 24 mil dias, e o primeiro sinal seria um 401 em produção.

### Dois enganos de configuração que o cliente resolve sozinho

- **Base com o prefixo junto.** `https://host/api/v1` produziria
  `/api/v1/api/v1/...` — um 404 que parece problema de rota e é de
  configuração. O sufixo `/api` ou `/api/v1` é removido da base.
- **Redirecionamento.** `fetch` segue redirect e, num 301/302, **troca POST por
  GET** (é o que a especificação manda). Uma base em `http://` num host que
  redireciona para `https://` transforma `POST /auth/login` em `GET` — e o
  endpoint responde **405**, que não conta essa história. A mensagem de erro
  agora nomeia o redirect e a URL final.

## Retry — o que insiste e o que não

| Situação | O que acontece |
|---|---|
| Rede, timeout, 5xx | 3 tentativas, backoff exponencial com jitter |
| 401 | Renova o token e repete **uma vez**. Segundo 401 sobe |
| 400, 403, 404, 409, 422 | **Sem retry** — payload errado não melhora com insistência |
| 5 falhas transitórias seguidas | Disjuntor abre por 60s |

**409 não é erro do cliente HTTP.** Ele é a resposta certa de um retry
idempotente que deu certo, e quem decide o que fazer com ele é o chamador (a
fase 3). Insistir aqui esconderia a cobrança que já existe do outro lado.

**4xx não conta para o disjuntor.** O gateway está de pé e respondeu — contar
faria um cadastro errado de um cliente derrubar a emissão de todos os outros.

## O cliente no gateway (`ClientesGatewayService`)

A regra que atravessa o serviço inteiro: **falha de sincronização não é exceção
que sobe, é estado que se grava**. A linha de `assinatura_clientes_gateway`
guarda o motivo, a aba Pendências mostra, e o superadmin resolve. Erro que só
existe no log é erro que ninguém vê — e este custa a cobrança de um cliente no
mês.

```
sem documento        → pendência, não chama o gateway
documento inválido   → pendência (dígito verificador confere aqui também)
customer não existe  → POST /customers
  └─ 400 duplicado   → GET /customers?search=<doc> e ADOTA o existente
customer existe      → PUT /customers/{id} (sem o documento)
```

### Por que adotar no 400

Documento duplicado acontece de verdade em três situações: retry depois de um
timeout que na verdade criou, cliente cadastrado à mão no painel do gateway, e
restauração de banco. Nas três o customer certo já está lá e criar outro é
impossível — o documento é único entre os clientes ativos da company.

Adotar é seguro porque documento igual **é** a mesma pessoa jurídica. O que
protege contra adotar o customer de outro cliente nosso é o índice único de
`customer_id`: se ele já estiver vinculado, a gravação falha e vira pendência —
o desfecho certo, porque dois clientes nossos com o mesmo documento é erro de
cadastro, não de integração.

**A conferência do documento exato é nossa.** O `search` da API é LIKE em nome,
documento e e-mail: ele traz parecidos, e adotar por semelhança é como se cobra
o cliente errado.

### Duas armadilhas de campo

- **Documento não se atualiza no gateway.** `PUT /customers` ignora o campo.
  Por isso guardamos `documento_enviado`: quando o cadastro muda depois, a
  divergência vira pendência, e o conserto é um customer novo lá — não o botão
  de sincronizar.
- **Campo vazio fica fora do corpo**, nunca como string vazia. No `PUT` parcial,
  string vazia apagaria o que estivesse lá — e o e-mail do gateway é por onde o
  cliente recebe o link de pagamento.
- **Telefone vai sem o `+55`.** Nós guardamos E.164; o gateway espera DDD sem
  DDI.

## A cobrança (`CobrancasService`)

`POST /charges/undefined`: **um link só**, e o cliente escolhe PIX, boleto ou
cartão na tela do gateway. Escolher o método por ele significaria decidir por um
condomínio inteiro como o síndico prefere pagar, e trocar depois exigiria
cancelar e reemitir.

`externalReference` leva **o id da nossa fatura**. É a correlação que sobrevive a
tudo: perdido o `cobranca_id`, o webhook ainda diz de qual fatura ele fala.

### 409 é sucesso (e onde ele não é)

| Operação | 409 significa | O que fazemos |
|---|---|---|
| `POST /charges/undefined` | Replay de idempotência | **Sucesso** — lê a cobrança que já existe |
| `DELETE /charges/{id}` | Já não é cancelável | **Sucesso** — não vai mais ser paga por engano, que era o objetivo |
| `POST .../received-in-cash` | Já não está pendente | **Sucesso** — já foi recebida |

Tratar o 409 da emissão como erro marcaria a fatura como falha **tendo cobrança
viva no gateway**: o pior dos dois mundos, porque o cliente recebe o link e nós
achamos que não emitimos.

Quando o 409 vem sem o corpo da cobrança, procuramos pela `externalReference`.
Sem esse resgate, a tentativa seguinte veria "pendente" e emitiria de novo.

### O mapa de status

`status-cobranca.ts`. Duas traduções não são óbvias:

- **`CONFIRMED` já é `paga`.** Confirmado é "o pagamento aconteceu"; liquidado
  (`RECEIVED`) é "o dinheiro caiu", o que no boleto leva o D+1 do banco. Quem
  pagou não pode ficar bloqueado esperando a compensação.
- **`FAILED` volta para `aberta`.** A tentativa falhou; a dívida continua.

**Status desconhecido devolve `null`** em vez de quebrar: guarda-se o bruto em
`cobranca_status_gateway` e não se mexe no nosso. Um enum novo do lado deles não
pode derrubar o processamento aqui.

`deveAvancar()` existe para evento fora de ordem — `RECEIVED` pode chegar antes
de `CONFIRMED`. **Nunca voltar de `paga` para `aberta`** por evento velho: a
comparação é por precedência, não por ordem de chegada. Disputa é o topo, porque
exige gente e nenhum evento pode apagá-la.

**`paga` não é terminal.** Parece e não é: estorno e chargeback chegam depois da
baixa, e é o caso em que perder o webhook custa caro.

## O evento que chega (`webhook-payload.ts`)

**O formato do repasse nunca foi visto na prática.** A Payment API recebe o
webhook do Asaas e repassa para uma URL nossa — mas se ela reencaminha o
envelope cru, embrulha num próprio, ou manda o `WebhookEventResponse` dela, é
coisa que só o primeiro evento real conta.

Em vez de apostar num formato, o parser **procura os campos** em largura, em
qualquer profundidade. Três envelopes plausíveis estão cobertos por teste, e o
quarto degrada com segurança: o payload bruto fica gravado de todo jeito, então
um formato desconhecido vira um evento `erro` com o corpo inteiro — não uma
baixa perdida em silêncio.

Busca em **largura**, não profundidade: o campo do envelope externo vence o
homônimo enterrado. Um `id` na raiz é o id do evento; um `id` dentro de
`payment` é o do pagamento. Trocar os dois faria a deduplicação usar o id do
pagamento, e dois eventos do mesmo pagamento (confirmado, depois liquidado)
passariam a ser considerados o mesmo evento.

### A armadilha do `status`

`status` na raiz de um envelope pode ser o **`WebhookEventStatus`** deles
(`PROCESSED`, `FAILED`, `DLQ`) — o status do *processamento do evento*, não o do
pagamento. Por isso o parser devolve `statusConfiavel`, que só é `true` quando o
status veio de dentro de um objeto `payment`/`charge`.

Quando é `false`, quem manda é o gateway: consulta-se `GET /charges/{id}`. Custa
uma chamada e elimina a chance de marcar uma fatura como paga por causa de um
evento *processado com sucesso* que dizia justamente o contrário.

## Cupom (`CuponsService`)

**O cupom vive no gateway.** Escopo, vigência, limite global, limite por cliente
e a contagem de uso são de lá, e é de lá que sai o desconto de verdade. Guardar
uma cópia aqui criaria duas fontes da verdade que divergem no primeiro erro de
rede — e a que importa é a que desconta. Por isso este serviço não tem
repositório: ele traduz chamadas.

O escopo é sempre **`CHARGE`**: não usamos `subscriptions`, cada fatura é uma
cobrança avulsa. Um cupom de escopo `SUBSCRIPTION` seria criado sem reclamação e
nunca se aplicaria a nada.

`validar()` devolve **`null`** quando não deu para validar (rede, gateway fora).
O chamador trata isso como "sem cupom", e a fatura sai pelo valor cheio: **errar
para mais é conserto de um clique; errar para menos é dinheiro que não volta.**

A validação **não incrementa o uso** — a real acontece de novo na hora de
aplicar, do lado deles, para não estourar `maxUses` numa corrida. É por isso que
a emissão confere o valor devolvido pela cobrança em vez de confiar na resposta
do validate.

## Bloqueio por inadimplência

Quem decide se um cliente está bloqueado é o **gateway** (ele conhece as
cobranças vencidas). O que este módulo acrescenta é cache e, sobretudo,
**fail-open**.

### Fail-open é inegociável

Toda dúvida responde "liberado": gateway fora do ar, timeout, 404, cliente sem
customer, Redis indisponível, resposta que não entendemos, provider que não
resolveu. O prejuízo de deixar um inadimplente trabalhar por um dia é menor que
o de travar **todos** os adimplentes numa queda nossa.

> **Não existe um único `catch` que devolva bloqueado.** Se um dia existir, é um
> defeito — e `acesso.service.spec.ts` tem um caso para cada caminho de falha
> justamente para que a regressão apareça.

### Ligar o bloqueio

`PAYMENT_BLOQUEIO_ATIVO` nasce **`false`**, e isso não é timidez: este é o único
interruptor do sistema capaz de tirar clientes adimplentes do ar. Ligá-lo junto
com o deploy do código faria o bloqueio valer no mesmo instante em que passa a
existir — sem ninguém ter conferido nada.

A ordem para ligar:

1. **Aba Pendências vazia.** Cliente sem documento ou sem `customer` nunca é
   bloqueado (fail-open), mas também nunca é cobrado — e é isso que se está
   prestes a transformar em bloqueio para os outros.
2. **Política salva e sincronizada**, com `bloquearAvulsas` ligado. Sem ele
   **nada bloqueia**: as nossas faturas são cobranças avulsas, e o padrão do
   gateway é ignorá-las.
3. **Tolerância de 5 dias e 1 fatura** (o padrão da migration). O cliente que
   esquece o boleto não fica sem portaria na segunda-feira de manhã.
4. Só então `PAYMENT_BLOQUEIO_ATIVO=true`.

Desligar **não precisa de deploy** — é o freio de mão da funcionalidade.

### O cache e o desbloqueio

Cinco minutos em Redis, por customer. **Toda baixa limpa o cache na hora**
(webhook, conciliação e baixa manual): cinco minutos olhando uma tela travada
depois de ter pago é a pior experiência que este sistema pode oferecer.

Na baixa manual, o `esquecer` acontece **antes** de falar com o gateway e mesmo
com ele fora — é o passo que não pode ser pulado por causa de rede.

## Dados

`assinatura_clientes_gateway` (migration 030): `tenant_id` XOR
`administradora_id`, `customer_id`, `asaas_id`, `documento_enviado`,
`sincronizado_em`, `erro_ultima_sync`.

`customer_id` é **nullable** de propósito: a linha também registra a tentativa
que falhou. Sem isso, não haveria onde guardar o motivo.

Três índices únicos: um por condomínio, um por administradora, e um por
`customer_id` — este último é o que impede dois clientes nossos apontando para o
mesmo customer.

## Testes

| Arquivo | O que prova |
|---|---|
| `payment-api.client.spec.ts` | Retry só no transitório; 401 renova **uma** vez; refresh recusado cai para login; `expiresIn` em ms; 4xx não abre o disjuntor |
| `clientes-gateway.service.spec.ts` | Sem documento vira pendência gravada; 400 duplicado adota **só** com documento exato; `PUT` não manda documento; desligado não chama nada |
| `cobrancas.service.spec.ts` | 409 tratado como sucesso nas três operações; a chave de idempotência vai no header, não no corpo; o mapa de status, a precedência e os terminais |
| `webhook-payload.spec.ts` | Os três envelopes plausíveis; o `id` da raiz é o do evento; **`PROCESSED` marcado como status não confiável**; corpo estranho degrada em vez de derrubar |
| `acesso.service.spec.ts` | **Um caso por caminho de falha**, todos liberando; o interruptor nasce desligado; `esquecer` destrava na hora |
| `common/guards/acesso-assinatura.guard.spec.ts` | Leitura, rotas isentas, superadmin e provider ausente passam; o 402 carrega link e valor |
| `test/acesso-bloqueio.e2e-spec.ts` | Por HTTP: **nasce inerte**, `/assinatura` continua acessível, e falha ao avaliar libera |

## Ao alterar este módulo

- [ ] Endpoint novo da API → espelhe o DTO em `payment-api.types.ts` **copiando
      da referência**, e ignore campo desconhecido em vez de tipar tudo.
- [ ] Chamada que cria dinheiro → `Idempotency-Key` **persistida**, gerada uma
      vez e nunca no retry. É assim que se cobra o cliente duas vezes.
- [ ] Falha nova → decida se ela é estado (grava e aparece em Pendências) ou
      exceção (sobe). O padrão deste módulo é **estado**.
- [ ] Mexeu no cliente HTTP → `payment-api.client.spec.ts` cobre as fronteiras
      de retry; elas são o que separa "tentar de novo" de "cobrar duas vezes".
- [ ] Fase nova do plano → atualize o estado no topo deste arquivo e em
      `docs/plano-cobranca-gateway.md`.
