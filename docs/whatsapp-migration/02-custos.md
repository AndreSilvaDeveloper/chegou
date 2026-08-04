# Custos — WhatsApp Business Platform (Cloud API)

> ## ⛔ Este documento está **incompleto por decisão**, e não por descuido
>
> A **estrutura** de preço veio toda de fonte oficial da Meta e está confirmada
> (§1 e §2). As **tarifas numéricas** — quanto custa uma mensagem utility no
> Brasil, em BRL — **não** foram obtidas: a Meta as publica em CSV/PDF de
> download e numa calculadora JavaScript, e nenhum dos dois é legível pelas
> ferramentas disponíveis.
>
> Encontrei valores em blogs de terceiros. **Não os usei e não os reproduzo
> aqui**: eles não são fonte oficial, divergem entre si, e um número errado num
> documento de custo é pior que nenhum número.
>
> **O que preciso de você**: a tabela BRL de
> [developers.facebook.com/docs/whatsapp/pricing](https://developers.facebook.com/docs/whatsapp/pricing)
> → *BRL rates* + *BRL volume tiers*, ou a leitura da calculadora em
> [whatsappbusiness.com/pt-br/products/platform-pricing](https://whatsappbusiness.com/pt-br/products/platform-pricing/)
> com **Mercado = Brasil, Moeda = BRL**, nas quatro categorias.
>
> Assim que você colar, **só a tabela do §3 precisa ser preenchida** — todo o
> resto do documento já está calculado e passa a produzir números sozinho.

**Data de consulta à documentação da Meta**: 04/08/2026.
**Legenda**: ✅ confirmado em fonte oficial · 🟡 hipótese explícita ·
⛔ pendente de tarifa oficial.

---

## Sumário

1. [O modelo de cobrança vigente](#1-o-modelo-de-cobrança-vigente)
2. [O que é gratuito](#2-o-que-é-gratuito)
3. [Tarifas — a preencher](#3-tarifas--a-preencher)
4. [Enquadramento do aviso de encomenda](#4-enquadramento-do-aviso-de-encomenda)
5. [Perfil de consumo do Chegou](#5-perfil-de-consumo-do-chegou)
6. [Projeção por faixa de volume](#6-projeção-por-faixa-de-volume)
7. [Análise de sensibilidade](#7-análise-de-sensibilidade)
8. [Comparativo com o custo atual do OpenWA](#8-comparativo-com-o-custo-atual-do-openwa)
9. [Otimizações de custo](#9-otimizações-de-custo)

---

## 1. O modelo de cobrança vigente

✅ **A Meta cobra por mensagem, não por conversa.** O modelo de janelas de 24 h
("conversation-based pricing") foi substituído por cobrança **por mensagem
entregue** em **01/07/2025**. Documentação de conversas continua existindo, mas
marcada como *deprecated*.

✅ **Só se paga pela mensagem entregue.** Mensagem aceita pela API mas não
entregue não é cobrada. Isso importa: o gatilho de cobrança é o webhook
`delivered`, não o `sent` — e é por isso que o [§6.3 do plano](01-plano-de-migracao.md#63-notificacoes--identidade-do-template-e-status)
grava `delivered_at`.

✅ **Cobra-se por categoria do *template*:**

| Categoria | Quando é cobrada |
|---|---|
| **Marketing** | **Sempre** que entregue — inclusive dentro da janela de atendimento |
| **Utility** | Só **fora** da janela de atendimento aberta pelo cliente |
| **Authentication** | Só fora da janela |
| **Service** (mensagem não-template) | **Gratuita** desde 01/11/2024 |

> A linha do marketing é a que mais dói e a que mais passa batido: **abrir a
> janela não deixa o marketing de graça**. Toda estratégia de "fazer o morador
> responder para economizar" só funciona para utility.

✅ **Faixas de volume** existem para utility e authentication, e o volume é
agregado **no nível do portfólio de negócios**, somando todas as WABAs dele, por
par mercado-categoria (ex.: Brasil-utility). Crescer barateia — e barateia
*junto*, não por condomínio.

✅ **Brasil em BRL**: desde 01/07/2026 é possível criar WABAs em reais, faturadas
pela **Facebook Brasil**. Adotar BRL evita IOF e exposição cambial. ⚠️ A moeda
**trava** quando o crédito é anexado à conta ([doc 03, Etapa 8](03-setup-conta-meta.md#etapa-8--forma-de-pagamento)).

⚠️ ✅ **Há mudança de tarifa anunciada para 01/10/2026.** As tarifas vigentes são
as de 01/07/2026. Como o rollout previsto no plano leva de 4 a 6 meses, **ele
atravessa essa data** — a projeção precisa ser refeita quando o novo rate card
sair. Item 13 de [00-perguntas-abertas](00-perguntas-abertas.md).

**Fontes** (04/08/2026):
[Pricing](https://developers.facebook.com/docs/whatsapp/pricing) ·
[Pricing (nova URL)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) ·
[Conversation-based pricing (deprecated)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing)

---

## 2. O que é gratuito

✅ Confirmado na documentação de preços da Meta:

| Isenção | Regra | Vale para o Chegou? |
|---|---|---|
| **Mensagens não-template dentro da janela** | Toda mensagem livre enviada com a janela de atendimento aberta é gratuita | 🟢 **Sim, e é grande**: `lembrete_codigo` e `sem_encomenda_pendente` são exatamente isso |
| **Utility dentro da janela** | Template utility entregue com a janela aberta não é cobrado | 🟢 Sim — encomenda que chega logo depois de o morador escrever sai de graça |
| **Conversas de serviço** | Gratuitas para todos desde 01/11/2024 | 🟢 Sim |
| **Free Entry Point (72 h)** | Janela de 72 h com tudo gratuito, aberta por anúncio Click-to-WhatsApp ou botão de CTA na Página | 🔴 **Não** — o Chegou não usa anúncios Click-to-WhatsApp. Só passa a valer se houver campanha de aquisição por esse canal |
| **Marketing dentro da janela** | ❌ **não existe isenção** | 🔴 Marketing é sempre cobrado |

**A janela de 24 h abre com a mensagem do morador**, não com a nossa. É por isso
que o fluxo bidirecional que já existe (`handleInboundIntent`) deixa de ser só
uma comodidade e vira **um mecanismo de custo**.

---

## 3. Tarifas — a preencher

⛔ **Preencha esta tabela e o documento inteiro passa a calcular.**

| Símbolo | Categoria | Tarifa BRL por mensagem entregue | Status |
|---|---|---|---|
| `P_util` | Utility | `___________` | ⛔ pendente |
| `P_mkt` | Marketing | `___________` | ⛔ pendente |
| `P_auth` | Authentication | `___________` | ⛔ não usado pelo Chegou |
| `P_svc` | Service | **R$ 0,00** | ✅ confirmado (gratuito) |

**Faixas de volume — utility, Brasil** ⛔

| Faixa (mensagens/mês no portfólio) | Tarifa |
|---|---|
| `_____________` | `_______` |
| `_____________` | `_______` |
| `_____________` | `_______` |

> Sem as faixas, as projeções do §6 usam a **tarifa de entrada** — ou seja,
> são o **teto**. Com as faixas, os cenários grandes ficam mais baratos, não mais
> caros.

**Onde copiar**: [developers.facebook.com/docs/whatsapp/pricing](https://developers.facebook.com/docs/whatsapp/pricing)
→ seção de rate cards → *BRL rates (CSV)* e *BRL volume tiers (CSV)*.
Anote a **data de vigência** que vem no arquivo — sem ela, a projeção não tem validade.

---

## 4. Enquadramento do aviso de encomenda

✅ **O aviso de encomenda é template `UTILITY`.** O raciocínio, contra a
definição oficial da Meta:

> *Utility*: mensagem que **acompanha uma ação ou solicitação do usuário**. Para
> se qualificar, precisa ser **não-promocional** **e** (**específica do usuário** —
> relacionada ao pedido ou à conta dele — **ou** essencial/crítica). Exemplos
> citados: confirmação de pedido, alerta de conta.

Aplicando a *"Chegou uma encomenda para a unidade A-101 na portaria do
Residencial Aurora. Código de retirada: 4827"*:

| Teste | Resultado |
|---|---|
| É promocional? | **Não.** Não vende nada, não promove nada |
| É específica do usuário? | **Sim.** É a encomenda **dele**, na unidade **dele**, com o código **dele** |
| Acompanha uma ação do usuário? | **Sim.** Ele comprou; a entrega é o desfecho |
| Mistura conteúdo de marketing? | **Não** — e não pode passar a misturar |

Atualização de entrega é o exemplo canônico de utility na diretriz da Meta.
O enquadramento é **sólido**, com uma ressalva:

> ⚠️ A Meta **recategoriza templates aprovados todo mês**. Um utility pode virar
> marketing se o conteúdo derivar. Duas consequências operacionais:
> 1. **Nunca** acrescentar nada promocional ao template de encomenda — nem
>    "conheça o app", nem logo de patrocinador. Uma linha promocional muda a
>    categoria de **todas** as mensagens de encomenda da plataforma.
> 2. O sistema tem de **ler a categoria vigente da API** (`category_current`,
>    [§6.2 do plano](01-plano-de-migracao.md#62-whatsapp_templates--o-catálogo-novo))
>    e usá-la no cálculo, nunca a categoria submetida.

**Custo unitário do aviso de encomenda** = `P_util`, **quando** entregue com a
janela de atendimento fechada. Com a janela aberta, **R$ 0,00**.

**As mesmas contas para as demais mensagens:**

| Mensagem | Categoria | Confiança |
|---|---|---|
| `encomenda_chegou` | UTILITY | ✅ alta |
| `encomenda_retirada` | UTILITY | ✅ alta (atualização do mesmo pedido) |
| `cobranca_vaga_*` | UTILITY | ✅ alta (cobrança específica da conta) |
| `cobranca_condominio` | UTILITY | ✅ alta |
| `aviso_urgente` / `aviso_manutencao` | UTILITY | 🟡 média — "essencial/crítico" é o argumento, e ele é subjetivo |
| `aviso_financeiro` | UTILITY | 🟡 média |
| `aviso_geral` / `aviso_evento` | **MARKETING** | 🔴 alta de que **seja** marketing: a diretriz classifica conteúdo genérico como marketing |
| `lembrete_codigo` · `sem_encomenda_pendente` | SERVICE (não-template) | ✅ **grátis** |

> **Só a Fase 1 do plano fecha isso.** Submeter os cinco templates de aviso e ler
> a categoria que a Meta devolve custa dois dias e elimina a maior incerteza
> desta projeção.

---

## 5. Perfil de consumo do Chegou

### 5.1 Os parâmetros

O custo é `C × M × (mensagens por morador/mês) × tarifa da categoria`:

| Símbolo | Significado | Valor 🟡 | De onde tirar o real |
|---|---|---|---|
| `C` | condomínios ativos | — | consulta 1 do [§1.4 do plano](01-plano-de-migracao.md#14-volume-e-picos) |
| `M` | moradores notificáveis por condomínio | **120** | consulta 1 |
| `E` | encomendas por morador/mês | **1,5** | consulta 2, tipo `encomenda` ÷ 2 |
| `A` | avisos por morador/mês | **2,0** | consulta 2, tipo `aviso` |
| `K` | cobranças por morador/mês | **0,2** | consulta 2, tipos `cobranca_*` |
| `J` | fração de envios com a janela de 24 h aberta | **10 %** | consulta 5 (relação in/out) |
| `m` | fração dos avisos que cai em marketing | **50 %** | Fase 1 do plano |

🟡 **Todos os valores acima são hipótese.** O código não guarda métrica de
volume, e não inventei nenhum: são pontos de partida plausíveis, todos
substituíveis pelas cinco consultas SQL do plano. **Troque-os antes de levar
este documento a uma decisão.**

### 5.2 Mensagens por morador por mês

Com os parâmetros acima:

| Mensagem | Qtd/morador/mês | Categoria | Cobrada? |
|---|---:|---|---|
| Encomenda chegou | 1,50 | utility | fora da janela |
| Encomenda retirada | 1,50 | utility | fora da janela |
| Aviso utility (urgente/manutenção/financeiro) | 1,00 | utility | fora da janela |
| Aviso marketing (geral/evento) | 1,00 | marketing | **sempre** |
| Cobrança (vaga + condomínio) | 0,20 | utility | fora da janela |
| Resposta ao morador | ~0,30 | service | **nunca** |
| **Total enviado** | **5,50** | | |

Aplicando `J = 10 %` sobre as **utility** (4,20):

| Bloco | Qtd/morador/mês |
|---|---:|
| Utility **cobrada** | 4,20 × 0,90 = **3,78** |
| Utility grátis (janela aberta) | **0,42** |
| Marketing **cobrada** | **1,00** |
| Service grátis | **0,30** |
| **Total gratuito** | **0,72** (13 % dos envios) |

**Custo por morador por mês** = `3,78 × P_util + 1,00 × P_mkt`

### 5.3 Picos

Dois picos, com naturezas diferentes:

- **Encomenda**: segue o horário da portaria — concentração à tarde, e sazonal
  (Black Friday, Natal). É **fluxo contínuo**, absorvido sem esforço pelos
  80 msg/s.
- **Aviso geral**: é **rajada**. Um aviso para um condomínio de 300 unidades são
  300 mensagens **em segundos**. Não estressa o throughput, mas **consome 300 dos
  destinatários únicos** do messaging limit de 24 h de uma vez.

> **É o aviso, não a encomenda, que dimensiona o tier.** No modo A (número único
> da plataforma, doc 03), o limite é compartilhado: dois condomínios grandes
> mandando aviso no mesmo dia somam. A conta a fazer é
> `Σ (unidades dos condomínios com aviso no mesmo dia) < tier vigente`.

---

## 6. Projeção por faixa de volume

Parâmetros de §5.1 (🟡 hipótese). **As colunas de mensagem estão calculadas; as
de reais dependem do §3.**

| Cenário | `C` | Moradores | Enviadas/mês | **Utility cobrada** | **Marketing cobrada** | Grátis | Custo mensal |
|---|---:|---:|---:|---:|---:|---:|---|
| **Atual** | ⛔ *a preencher* | | | | | | |
| **1 — base** | 10 | 1.200 | 6.600 | **4.536** | **1.200** | 864 | `4.536·P_util + 1.200·P_mkt` |
| **2 — 10×** | 100 | 12.000 | 66.000 | **45.360** | **12.000** | 8.640 | `45.360·P_util + 12.000·P_mkt` |
| **3 — 50×** | 500 | 60.000 | 330.000 | **226.800** | **60.000** | 43.200 | `226.800·P_util + 60.000·P_mkt` |
| **4 — 100×** | 1.000 | 120.000 | 660.000 | **453.600** | **120.000** | 86.400 | `453.600·P_util + 120.000·P_mkt` |

**Custo por condomínio por mês** (independe de `C`, é o número que importa para
precificar a assinatura):

```
custo_condominio_mes = M × (3,78 × P_util + 1,00 × P_mkt)
                     = 120 × (3,78 × P_util + 1,00 × P_mkt)
                     = 453,6 × P_util + 120 × P_mkt
```

**Custo por morador por mês** = `3,78 × P_util + 1,00 × P_mkt`

> Esta última linha é a que precisa entrar no modelo de assinatura. As faixas de
> `assinatura_faixas` cobram **por apartamento**; o custo de WhatsApp é **por
> morador notificável**. Não são a mesma coisa: um apartamento tem mais de um
> morador cadastrado, e nem todos recebem. A razão real
> (moradores notificáveis ÷ apartamentos) sai da consulta 1 do plano — e é ela
> que diz se a margem atual absorve o custo novo. Item 7 de
> [00-perguntas-abertas](00-perguntas-abertas.md).

> ⚠️ As projeções usam a **tarifa de entrada**, sem faixa de volume. Os cenários
> 3 e 4 estão, portanto, **superestimados** — as faixas do §3 os reduzem.

---

## 7. Análise de sensibilidade

Tudo expresso em múltiplos de `P_util`, assumindo a relação `P_mkt ≈ 9 × P_util`
🟡 (ordem de grandeza sugerida pela diferença entre as categorias; **substituir
pela razão real assim que o §3 for preenchido** — a conclusão qualitativa não
muda, mas os percentuais sim).

**Linha de base** (por morador/mês): `3,78 P_u + 1,00 P_m` = **12,78 P_u**

| # | Cenário | Composição | Custo | Δ |
|---|---|---|---:|---:|
| 0 | **Base** | 4,2 util / 1,0 mkt | 12,78 P_u | — |
| 1 | **Todos os avisos viram marketing** (Fase 1 reprova os cinco) | 3,2 util / 2,0 mkt | 20,88 P_u | **+63 %** |
| 2 | **Todos os avisos ficam utility** (melhor caso) | 5,2 util / 0,0 mkt | 4,68 P_u | **−63 %** |
| 3 | **Tudo é reclassificado marketing** (pior caso absoluto) | 0 util / 5,2 mkt | 46,80 P_u | **+266 %** |
| 4 | **Janela aberta em 40 % dos envios** (moradores respondem muito) | util cobrada 2,52 | 11,52 P_u | **−10 %** |
| 5 | **Janela aberta em 0 %** (ninguém responde) | util cobrada 4,20 | 13,20 P_u | **+3 %** |
| 6 | **Cortar a confirmação de retirada** | util 2,7 → cobrada 2,43 | 11,43 P_u | **−11 %** |
| 7 | **Aviso cai de 2/mês para 1/mês** (0,5 util + 0,5 mkt) | 3,7 util / 0,5 mkt | 7,83 P_u | **−39 %** |
| 8 | **Dobrar as encomendas** (Black Friday: E de 1,5 → 3,0) | 7,2 util / 1,0 mkt | 15,48 P_u | **+21 %** |

### As três conclusões

**① A categoria dos avisos domina a conta, não o volume de encomendas.**
Comparar a linha 1 (+63 %) com a linha 8 (+21 %): dobrar as encomendas — o
produto inteiro — custa um terço do que custa perder a classificação utility dos
avisos. **A Fase 1 do plano é a decisão financeira mais importante do projeto**,
e custa dois dias.

**② A janela de 24 h é uma alavanca fraca aqui.** Linhas 4 e 5: variar a taxa de
resposta de 0 % a 40 % move a conta em ~13 pontos. O motivo é que **marketing é
cobrado dentro da janela também** — e é o marketing que pesa. Investir para
"fazer o morador responder" só compensa depois de resolver a categoria dos
avisos.

**③ Aviso é o item mais caro por unidade de valor entregue.** Linha 7: reduzir
de 2 para 1 aviso/mês corta 39 % da conta. É a única alavanca que não depende de
aprovação da Meta nem de mudança de comportamento do morador — depende de
política de produto.

---

## 8. Comparativo com o custo atual do OpenWA

### 8.1 Onde está o custo hoje

O gateway OpenWA é **infraestrutura própria** (`OPENWA_BASE_URL` aponta para um
host da casa, `openwa.bellory.com.br`). O custo não é por mensagem — é fixo,
mais um custo variável escondido.

| Componente | Natureza | Valor |
|---|---|---|
| Servidor do gateway (uma sessão Chromium por condomínio: RAM é o gargalo, ~300–700 MB cada) | fixo, **escala com `C`** | ⛔ *a preencher* |
| Manutenção: quebra a cada atualização do WhatsApp Web | variável, imprevisível | ⛔ *h/mês × custo/h* |
| Suporte: reconectar sessão caída, QR expirado | variável, **escala com `C`** | ⛔ *h/mês × custo/h* |
| Chips e linhas dos números | fixo por condomínio | ⛔ |
| **Banimento de número** | risco | ⛔ *ver §8.2* |
| Mensagem | **R$ 0,00** | ✅ |

> ⚠️ **O custo de infra do OpenWA não é constante — ele cresce com o número de
> condomínios.** Uma sessão Chromium por condomínio é o modelo do WhatsApp Web.
> No cenário 4 (1.000 condomínios), são 1.000 sessões: centenas de gigabytes de
> RAM. Comparar "R$ 0 por mensagem" com a Cloud API só faz sentido incluindo
> essa curva.

### 8.2 O custo do banimento

É o item que motiva a migração e o que ninguém consegue orçar bem. Uma
decomposição honesta:

```
custo_banimento = P(ban por condomínio por ano)
                × C
                × [ horas de suporte por incidente × custo/hora
                  + custo de chip e reativação
                  + P(churn | ban) × LTV do condomínio ]
```

O termo que domina é o **último**. Um condomínio que fica dois dias sem
notificação de encomenda — o produto inteiro parado, na portaria, na frente do
síndico — é um candidato a cancelamento. **Isso não aparece em nenhuma linha de
custo, e é o maior número da tabela.**

Preencher `P(ban)` com o histórico real: quantos números foram bloqueados nos
últimos 12 meses, sobre quantos condomínios-ano. Item 14 de
[00-perguntas-abertas](00-perguntas-abertas.md).

### 8.3 Ponto de equilíbrio

```
custo_openwa_mensal(C) = infra(C) + manutencao + suporte(C) + chips(C) + risco(C)
custo_cloud_mensal(C)  = C × 453,6 × P_util + C × 120 × P_mkt

Equilíbrio:  custo_openwa_mensal(C) = custo_cloud_mensal(C)
```

**A forma das duas curvas já diz a resposta, mesmo sem os números:**

- O OpenWA tem **custo fixo alto por condomínio** (uma sessão, um chip, suporte
  recorrente) e **custo marginal por mensagem zero**.
- A Cloud API tem **custo fixo por condomínio ~zero** (no modo A, nem número
  próprio ele tem) e **custo marginal por mensagem positivo**.

Logo:

> **O OpenWA é mais barato para condomínio que manda muita mensagem; a Cloud API
> é mais barata para condomínio que manda pouca.** E o ponto de equilíbrio é
> **por condomínio**, não da plataforma.

O número que fecha essa conta:

```
mensagens_equilibrio_por_condominio = custo_mensal_openwa_por_condominio / P_util_medio
```

> **Mas a decisão não é essa.** Mesmo que a conta desse empate, a migração se
> justifica pela **variância**, não pela média: o OpenWA tem um custo de cauda
> (banimento → churn) que a Cloud API simplesmente não tem. Trocar custo variável
> previsível por risco de perder cliente é uma troca boa mesmo saindo mais caro
> — e vale a pena dizer isso em voz alta antes de olhar o número, para o número
> não ser usado para reabrir a decisão.

---

## 9. Otimizações de custo

Em ordem de retorno, calculada a partir do §7.

### 🥇 1. Ganhar a categoria utility para os avisos essenciais *(até −63 %)*

A alavanca maior de todas. Concretamente:

- Moldura fixa generosa no template (cabeçalho + saudação + rodapé), de forma que
  a variável **não** seja a maior parte do conteúdo — é isso que faz a Meta
  classificar como genérico e mandar para marketing.
- Nomes e textos que deixem o caráter essencial explícito: "Manutenção
  programada", "Aviso de segurança", "Interrupção de fornecimento".
- **Zero conteúdo promocional**, nem no rodapé.
- Submeter os cinco na Fase 1 e **medir**, em vez de supor.

### 🥈 2. Política de avisos *(−39 % ao ir de 2 para 1 por mês)*

- **Agrupar**: um resumo semanal em vez de três avisos avulsos. Uma mensagem
  custa o mesmo tenha ela uma linha ou vinte.
- **Teto por condomínio**: a cota diária que hoje existe como proteção
  anti-bloqueio ([§3.5 do plano](01-plano-de-migracao.md#35-o-ritmo-anti-bloqueio-deixa-de-fazer-sentido--mas-o-scheduler-não))
  **vira teto de custo**. Ela já está implementada — muda só o significado.
- **Mostrar o preço na tela do síndico antes de enviar**: "este aviso vai para
  247 moradores e é da categoria marketing". Nada reduz disparo desnecessário
  como ver a conta.
- **Segmentar**: o módulo de avisos já filtra por bloco e por apartamento. Aviso
  do elevador da torre B não precisa ir para a torre A. **Já dá para fazer hoje,
  e ninguém faz.**

### 🥉 3. Cortar ou tornar opcional a confirmação de retirada *(−11 %)*

O morador acabou de retirar a encomenda na portaria — ele sabe. A mensagem é
cortesia. Propostas, em ordem de preferência:

- Torná-la **configurável por condomínio** (`config_json`), desligada por padrão.
- Ou mandá-la **só quando quem retira não é o destinatário** — aí ela deixa de
  ser cortesia e vira informação de verdade ("sua encomenda foi retirada por
  outra pessoa"), que é exatamente o caso em que ela importa.

### 4. Usar a janela de 24 h *(−10 %, e só depois das anteriores)*

- Um rodapé de convite ("responda CÓDIGO a qualquer momento") aumenta a taxa de
  resposta e, com ela, a fração `J`.
- **Ordenar a fila para aproveitar janelas abertas**: entre dois moradores a
  notificar, mandar primeiro para quem tem janela aberta. Isso não muda o custo
  (o utility é grátis na janela de qualquer forma), mas **agrupar por janela**
  ajuda quando há várias mensagens para o mesmo morador.
- Efeito limitado, pelo motivo do §7-②. **Não comece por aqui.**

### 5. Escolher categoria com consciência, não por hábito

- Toda mensagem nova nasce com a pergunta "isto é utility?" **antes** de ser
  escrita. Depois de aprovada, mudar de categoria é resubmeter.
- **Nunca** misturar promoção em template utility: contamina a categoria de
  **todas** as mensagens daquele template.

### 6. Concentrar volume num único portfólio

As faixas de volume são agregadas **por portfólio**. Espalhar condomínios por
vários portfólios (ou pela arquitetura C do doc 03, com uma WABA por condomínio)
faz **cada um começar na faixa mais cara**. É mais um argumento — agora
financeiro — a favor da arquitetura recomendada.

---

## Ao alterar este documento

- [ ] Preencheu o §3 → **recalcule o §6 e o §7** e tire os marcadores ⛔.
- [ ] Fase 1 concluída → substitua as categorias 🟡 pelas **reais**, e refaça o
      §7. É a atualização que mais muda este documento.
- [ ] Rodou as consultas SQL do plano → substitua os parâmetros 🟡 do §5.1 pelos
      reais. **Nenhuma projeção aqui vale antes disso.**
- [ ] Passou de 01/10/2026 → confira se o rate card mudou (§1) e refaça a
      projeção.
- [ ] Toda tarifa citada precisa de **link oficial + data de consulta**. Número
      sem procedência neste documento é dívida, não informação.
