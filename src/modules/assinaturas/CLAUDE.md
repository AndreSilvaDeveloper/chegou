# Módulo: Assinaturas

O que o **cliente paga pelo Chegou** — não confundir com o módulo Vagas, que
cobra o morador pelo aluguel de vaga. Aqui a plataforma cobra quem usa o sistema.

> **Estado: fase 4, primeira metade.** Dados, cálculo, rotas do superadmin, a
> visão do cliente (com tela dos dois lados) e o aviso de vencimento no painel.
> Falta a segunda metade: aviso por WhatsApp (depende de uma sessão da
> plataforma) e gateway de pagamento.

## Rotas e perfis

| Rota | superadmin | admin | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| `/admin/assinaturas/*` | ✅ | — | — | — |
| `/minha-administradora/assinatura` | — | ✅ | — | — |
| `/assinatura` | — | — | ✅ | — |

**O porteiro não entra em nenhuma**: a conta do condomínio não é assunto de
portaria.

**A administradora não usa `/assinatura`.** A conta dela é a da carteira, não a
de um condomínio — daria a impressão de que cada condomínio tem uma fatura, que
é exatamente o contrário da regra deste módulo.

### Plataforma — `/admin/assinaturas`

Todas `@Roles('superadmin')`; é a receita do Chegou. **Não há `X-Tenant-Id`
aqui**: o recorte não é o condomínio da request, é o cliente escolhido em cada
rota.

| Rota | O que faz |
|---|---|
| `GET /faixas` · `PUT /faixas` | Lê e substitui a tabela de preços (lista completa) |
| `GET /previas` | Quanto entra se o mês fechar hoje, cliente a cliente |
| `GET /previas/condominio/:id` · `/administradora/:id` | A conta de um cliente |
| `GET /condicoes` · `POST /condicoes` | Preço especial: histórico e negociação nova |
| `POST /condicoes/:id/encerrar` | Cliente volta para a tabela da plataforma |
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

**O id do cliente nunca vem da URL**: da administradora sai de
`@AdministradoraId()`, do condomínio sai de `@TenantId()`. Nas rotas de `:id` de
fatura, o service confere o dono e responde **404 — não 403** quando a fatura é
de outro: quem não é dono não pode nem descobrir que ela existe. Isso está
provado em `test/assinaturas-cliente.e2e-spec.ts`.

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

## Preço

Por **apartamento ativo** de **condomínio ativo**. Bloco não entra na conta: ele
organiza a unidade, não multiplica preço. Como no Chegou "remover é desativar",
unidade desativada sai da conta sozinha.

A faixa é escolhida pela quantidade e o preço dela vale para **todos** os
apartamentos — **não é escalonado por trecho**:

```
120 apartamentos → faixa de R$ 3,49 → 120 × 3,49 = R$ 418,80
              (e não 50 × 3,99 + 70 × 3,49 = R$ 443,80)
```

Tabela inicial (migration 024, editável): 3,99 até 50 · 3,49 de 51 a 200 ·
2,99 acima de 200.

**Desconto por volume vale para a carteira**: três condomínios de 40 unidades
somam 120 e todos pagam 3,49, mesmo cada um sozinho estando na faixa de 3,99.

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
| `assinatura_faixas` | Tabela de preços da plataforma |
| `assinatura_condicoes` | Preço especial de um cliente (tenant XOR administradora) |
| `assinatura_faturas` | Fatura mensal (tenant XOR administradora) |
| `assinatura_fatura_itens` | Um item por condomínio — a composição do valor |

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
3. **Vencimento é no mês seguinte** (padrão dia 10). A assinatura é pós-paga: a
   contagem de apartamentos só fecha quando o mês acaba, então cobrar dentro da
   própria competência seria cobrar um número que ainda vai mudar.
4. **Fatura vencida vira `vencida` sozinha** na consulta, não por job — mesma
   escolha do módulo Vagas.
5. **Cancelada não entra em nenhum total**: não foi cobrada e não é dívida.

### Trocar a tabela de preços

`PUT /faixas` substitui a tabela **inteira** (não é incremental) numa transação.
A última faixa precisa ficar sem teto e os tetos precisam crescer — sem faixa
aberta no topo, um cliente maior que a tabela cairia num preço por acaso. Nada
disso toca fatura emitida.

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
| `calculadora-assinatura.spec.ts` | Fronteiras de faixa (50/51/200/201), carteira somada, os três modos, desconto, arredondamento |
| `datas.spec.ts` | Vencimento no mês seguinte, dia 31 em mês curto, ano bissexto, véspera, distância entre datas |
| `aviso-vencimento.spec.ts` | A régua do aviso: 3 dias, no dia, atraso, qual fatura entra em destaque, total em aberto |
| `test/assinaturas.e2e-spec.ts` | O SQL: quem é o sacado, quais apartamentos contam, condição vigente vs. vencida, geração idempotente e baixa |
| `test/assinaturas-cliente.e2e-spec.ts` | O acesso, por HTTP: quem vê a própria conta, quem toma 404/403 tentando ver a de outro, e para quem o `aviso` chega |

> O e2e gera na competência **2099-01** de propósito: a geração varre o banco
> inteiro, então precisa de um mês que não esbarre em dado real nem em outra
> rodada. Mexeu na geração? Confira que o `afterAll` continua limpando.

## Ao alterar este módulo

- [ ] Mexeu no cálculo → rode os três arquivos de teste acima. Fronteira de
      faixa é o que mais dói errado em produção.
- [ ] Mudou a tabela de preços → **não** mexa em fatura já emitida; o valor dela
      é fotografia.
- [ ] Campo novo na fatura → lembre que ela precisa se explicar sozinha daqui a
      um ano, sem depender das tabelas de configuração de hoje.
- [ ] Rota nova → superadmin em `/admin/assinaturas`; administradora em
      `/minha-administradora/assinatura` (id vem de `@AdministradoraId()`, nunca
      da URL); síndico só vê a do próprio condomínio e só quando direto.
- [ ] Status novo de fatura → reveja `resumo()` (cancelada fica fora dos totais),
      `atualizarVencidas()`, o `EM_ABERTO` de `aviso-vencimento.ts` e
      `STATUS_FATURA_META` no front.
- [ ] Mexeu na régua do aviso → `aviso-vencimento.spec.ts` cobre as fronteiras
      sem banco; o e2e só prova que o aviso chega ao dono certo. **Não use
      `CURRENT_DATE` no e2e**: o Postgres roda em UTC e o produto conta os dias
      em São Paulo — depois das 21h os dois discordam em um dia.
- [ ] Rota nova que recebe id de fatura → **confira o dono** com
      `obterDoTenant`/`obterDaAdministradora`. `obter(id)` cru não filtra nada.
