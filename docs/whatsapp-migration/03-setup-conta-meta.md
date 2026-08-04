# Setup da conta Meta — estrutura, escolha de arquitetura e passo a passo

> **Status**: proposta. **Data de consulta à documentação da Meta**: 04/08/2026.
> Pré-requisito de leitura: [01-plano-de-migracao.md](01-plano-de-migracao.md).

---

## Sumário

1. [Vocabulário: o que é cada coisa](#1-vocabulário-o-que-é-cada-coisa)
2. [Os limites que decidem a arquitetura](#2-os-limites-que-decidem-a-arquitetura)
3. [As três arquiteturas possíveis](#3-as-três-arquiteturas-possíveis)
4. [Comparativo](#4-comparativo)
5. [Recomendação](#5-recomendação)
6. [Passo a passo da opção recomendada](#6-passo-a-passo-da-opção-recomendada)
7. [Escalonamento dos messaging limits](#7-escalonamento-dos-messaging-limits)
8. [Armadilhas por etapa](#8-armadilhas-por-etapa)

---

## 1. Vocabulário: o que é cada coisa

Quatro objetos, encaixados. Confundi-los é a origem de metade dos erros de setup.

```
Business Portfolio  (antigo "Business Manager")
│   A empresa dentro da Meta. É aqui que mora a verificação de negócio,
│   a linha de crédito e as pessoas com acesso.
│
├── App (Meta for Developers)
│     Onde vivem o App ID, o App Secret e o webhook. UM app atende
│     quantas WABAs você quiser.
│
├── WABA — WhatsApp Business Account
│   │   O "guarda-chuva" das mensagens: templates, números e o
│   │   histórico de qualidade. Uma WABA pertence a UM portfólio, e
│   │   NÃO pode ser migrada entre empresas.
│   │
│   ├── Business phone number (com phone_number_id)
│   │     O número que envia. Tem display name, quality rating e
│   │     messaging tier PRÓPRIOS.
│   │
│   └── Message templates (até 250 por WABA, compartilhados por
│         todos os números daquela WABA)
│
└── System User + token
      A "conta de serviço". É com o token dele que o Chegou chama a API.
```

**Duas consequências que valem gravar:**

- **Templates são da WABA, não do número.** Vários números na mesma WABA
  compartilham os 11 templates do [§5 do plano](01-plano-de-migracao.md#5-mapeamento-mensagem-atual--template-da-meta).
  Isso é o que torna a opção B barata de operar.
- **Quality rating e messaging tier são do número, não da WABA.** É o que torna
  a opção A arriscada e a B segura.

---

## 2. Os limites que decidem a arquitetura

Conferidos na documentação oficial em 04/08/2026.

| Limite | Valor | Fonte |
|---|---|---|
| Números por **portfólio** | **2** ao criar; sobe automaticamente para **20** quando o negócio é verificado **ou** atinge messaging limit de 2.000 | [Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers) |
| WABAs por portfólio | **20** inicialmente | [Business accounts](https://developers.facebook.com/docs/whatsapp/overview/business-accounts) |
| Templates por WABA | **250** | idem |
| WABA compartilhada com parceiros | até **2** | idem |
| Migração de WABA entre empresas | **não existe** | idem |
| Número já ativo no WhatsApp | precisa ser **apagado do WhatsApp** antes de registrar | [Phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers) |
| Número após registrado | continua servindo para **ligação e SMS**, mas **não pode mais ser usado no WhatsApp Messenger** | idem |
| Throughput | 80 msg/s por número (padrão) | [Cloud API overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview) |
| Messaging tiers | 250 → 2.000 → 10.000 → 100.000 → ilimitado (destinatários únicos / 24 h móveis) | [Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits) |
| Faixas de volume (preço) | agregadas **no nível do portfólio**, por par mercado-categoria | [Pricing](https://developers.facebook.com/docs/whatsapp/pricing) |

> **O número 20 é o que mata a opção B em escala.** Um portfólio comporta ~20
> números. Cem condomínios com número próprio = cinco portfólios, cinco
> verificações de negócio, cinco linhas de crédito, cinco painéis. Se o teto de
> 20 é elevável via suporte da Meta, isso muda a conta — mas **a documentação não
> promete isso**, e planejar em cima de uma exceção é planejar em cima de nada.
> Ver item 4 de [00-perguntas-abertas](00-perguntas-abertas.md).

> **As faixas de volume são do portfólio, não do número.** Isso derruba um
> argumento comum a favor de concentrar tudo num número só: o desconto por volume
> já vem concentrado de qualquer jeito, desde que os números estejam no mesmo
> portfólio.

---

## 3. As três arquiteturas possíveis

### A) Um número da plataforma para todos os condomínios

```
Portfólio Chegou ─── WABA Chegou ─── 1 número: +55 XX XXXXX-XXXX
                                      display name: "Chegou"
                                      ↓
                 todos os moradores de todos os condomínios
                 (o condomínio é identificado no corpo da mensagem)
```

O morador recebe *"Chegou uma encomenda para a unidade A-101 na portaria do
Residencial Aurora"* de um número único da plataforma — o modelo do iFood, do
Nubank, de qualquer SaaS.

**Prós**

- **Onboarding de condomínio novo custa zero trabalho na Meta.** É o único ponto
  em que uma das três opções preserva o cadastro de condomínio como ele é hoje:
  criar o tenant e sair usando.
- Um número, um tier, um quality rating para acompanhar. Sobe para "ilimitado"
  rápido, porque concentra todo o volume.
- 11 templates no total, para sempre.
- **Mais mensagens de graça**: a janela de 24 h é por par (número do negócio ↔
  morador). Com um número só, um morador que já escreveu para o Chegou por causa
  do condomínio A tem janela aberta também para o condomínio B. Em condomínio
  com muita resposta, isso desloca volume para a faixa gratuita.
- Custo de aquisição de números: um chip.
- LGPD: um controlador/operador, um registro, um contrato.

**Contras**

- 🔴 **Quality rating é ponto único de falha da plataforma inteira.** Um
  condomínio disparando aviso demais e sendo denunciado degrada as notificações
  de *todos*. Com 100 condomínios, a chance de existir pelo menos um assim é
  praticamente 1.
- 🔴 **Roteamento do inbound piora.** Hoje, telefone cadastrado em dois
  condomínios é desempatado pelo número de destino (`tenants.whatsapp_numero`).
  Com número único, esse desempate deixa de existir e a mensagem fica sem dono —
  o `handleInboundIntent` não responde. É uma regressão real, ainda que num caso
  raro.
- 🟠 O morador não vê o nome do condomínio como remetente. O condomínio perde
  identidade; o Chegou ganha.
- 🟠 **O condomínio não é dono de nada.** Bom para retenção, ruim para a venda a
  administradoras que querem marca própria.
- 🟠 Todo o volume da plataforma passa por um número: 80 msg/s é bastante, mas é
  um teto compartilhado.

**Custo de implementação**: ~zero além do plano base. **Esforço de onboarding por
condomínio: nenhum.**

---

### B) Uma WABA do Chegou, um número por condomínio

```
Portfólio Chegou ─── WABA Chegou ─┬── número condo A  (display: "Residencial Aurora")
                                  ├── número condo B  (display: "Edifício Solar")
                                  └── ... até ~20 números por portfólio
                     templates: os 11, compartilhados por todos
```

**Prós**

- 🟢 **Isolamento de quality rating e de messaging tier.** Um condomínio ruim
  degrada só a si mesmo. Este é o argumento decisivo contra a A.
- 🟢 **Roteamento perfeito**: cada condomínio tem `phone_number_id` próprio, e o
  webhook diz de quem é o evento. Acaba a ambiguidade de telefone repetido.
- 🟢 O morador vê o nome do condomínio. Paridade total com hoje.
- 🟢 **Templates continuam sendo 11** — eles são da WABA, não do número. Operar
  não fica mais caro conforme a base cresce.
- Dá para migrar **o número que o condomínio já usa** (paridade máxima).

**Contras**

- 🔴 **Teto de ~20 números por portfólio.** Além disso, portfólios adicionais —
  cada um com verificação de negócio, faturamento e administração próprios.
- 🔴 **Cada número começa no tier 250.** Um condomínio de 300 unidades **não
  consegue** mandar um aviso geral no primeiro dia. Precisa aquecer, e o
  aquecimento depende de volume que ele ainda não tem.
- 🟠 Um chip por condomínio (ou o número atual dele, que some do WhatsApp do
  aparelho).
- 🟠 Onboarding cresce: registrar número, verificar por SMS/voz, aprovar display
  name. Dias, não minutos.
- 🟠 **Display name é revisado pela Meta** e precisa ter relação com o negócio.
  "Residencial Aurora" numa WABA verificada como "Chegou Tecnologia LTDA" **pode
  ser recusado**. É o risco mais subestimado desta opção — a confirmar (item 4 de
  [00-perguntas-abertas](00-perguntas-abertas.md)).

**Custo de implementação**: baixo (o código é o mesmo da A — muda o dado).
**Esforço de onboarding por condomínio: 1–3 dias, com espera da Meta.**

---

### C) Cada condomínio com WABA própria, Chegou como Tech Provider

```
Portfólio do Condomínio A ─── WABA A ─── número A ─── 11 templates
Portfólio do Condomínio B ─── WABA B ─── número B ─── 11 templates
        ▲
        └── acesso concedido ao app do Chegou via Embedded Signup
            (token on-behalf-of por cliente)
```

O síndico passa por um fluxo de Embedded Signup dentro do painel do Chegou; ao
final, o **condomínio** é dono da WABA e do número, e o Chegou recebe um token
para operar em nome dele.

**Prós**

- 🟢 **Escala sem teto.** É a arquitetura desenhada pela Meta para SaaS.
- 🟢 Isolamento total: qualidade, tier, faturamento, dados.
- 🟢 O condomínio é dono do número e da conta — vende bem para administradora
  grande, e resolve a pergunta "o que acontece se eu sair?".
- 🟢 O condomínio paga a Meta direto (no modelo Tech Provider), tirando o custo
  de mensagem da conta do Chegou.

**Contras**

- 🔴 **O onboarding é incompatível com o público.** No modelo Tech Provider, o
  cliente precisa ter conta Meta Business **e cadastrar a própria forma de
  pagamento**. Um síndico não vai criar Business Manager, verificar o CNPJ do
  condomínio e pôr cartão na Meta. Isso quebra a premissa central do produto
  ("o morador não baixa app" tem um irmão: "o síndico não vira administrador de
  plataforma").
- 🔴 **App Review obrigatório** para acesso avançado a
  `whatsapp_business_management` e `whatsapp_business_messaging`.
- 🔴 **Templates multiplicam**: 11 × N condomínios. Melhorar o texto padrão da
  notificação de encomenda passa a ser uma migração de N submissões, cada uma
  com risco próprio de rejeição.
- 🟠 No modelo Solution Partner (Chegou banca via linha de crédito
  compartilhada), some a fricção do cartão — mas exige linha de crédito com a
  Meta e aceitar os termos da Credit Allocation API.
- 🟠 Um token por cliente, que precisa ser **guardado criptografado** e
  renovado/revogado. Superfície de segurança nova e séria.
- 🟠 Se o condomínio sai, ele leva a WABA — que é o que se quer — mas leva também
  o histórico, e não há como o Chegou "desprovisionar" com garantia.

**Custo de implementação**: alto (Embedded Signup, App Review, cofre de tokens,
gestão de N×11 templates). **Esforço de onboarding por condomínio: alto e
dependente do cliente**, que é o pior tipo.

---

## 4. Comparativo

| Critério | **A** — número único | **B** — WABA Chegou, número por condo | **C** — WABA por condo (Tech Provider) |
|---|---|---|---|
| **Teto de escala** | 🟢 nenhum | 🔴 ~20 números/portfólio | 🟢 nenhum |
| **Isolamento de quality rating** | 🔴 nenhum — falha única da plataforma | 🟢 total | 🟢 total |
| **Isolamento de messaging limit** | 🟢 irrelevante (um tier alto serve a todos) | 🟠 isolado, mas **cada um começa em 250** | 🟠 idem |
| **Roteamento do inbound** | 🔴 regride (volta a ambiguidade de telefone) | 🟢 perfeito (`phone_number_id`) | 🟢 perfeito |
| **Dono do número** | Chegou | Chegou | **Condomínio** |
| **Condomínio sai da base** | 🟢 nada acontece | 🟠 número fica com o Chegou; se era dele, precisa devolver | 🟢 leva tudo — mas leva mesmo |
| **Verificação de negócio** | 1 (Chegou) | 1 por portfólio (~1 a cada 20 condos) | **1 por condomínio** |
| **Display name** | "Chegou" | nome do condomínio 🟠 (sujeito a recusa) | nome do condomínio 🟢 |
| **Templates a manter** | 🟢 11 | 🟢 11 por portfólio | 🔴 11 × N |
| **Onboarding de condomínio novo** | 🟢 zero | 🟠 1–3 dias + chip | 🔴 dias/semanas + ação do cliente |
| **Esforço de implementação** | 🟢 baixo | 🟢 baixo (mesmo código da A) | 🔴 alto (Embedded Signup + App Review) |
| **Quem paga a Meta** | Chegou | Chegou | Condomínio (ou Chegou, como Solution Partner) |
| **LGPD** | Chegou é operador único; base concentrada num número | igual, com segregação por número | Condomínio é controlador de fato; o Chegou opera com token dele |
| **Faixas de desconto por volume** | 🟢 agregadas no portfólio | 🟢 agregadas no portfólio | 🔴 cada condomínio começa na faixa mais cara |

> A última linha é fácil de passar batido e vale dinheiro: as faixas de volume
> são agregadas **por portfólio**. Na opção C, cada condomínio é um portfólio —
> ninguém acumula volume, e todo mundo paga a faixa de entrada.

---

## 5. Recomendação

> ## **Adotar a opção A como padrão, com a B disponível por condomínio — e descartar a C.**

E, mais importante: **A e B são o mesmo código.** A diferença é só se
`tenants.phone_number_id` está preenchido ou nulo:

| | `tenants.phone_number_id` | De onde sai o número | Roteamento do webhook |
|---|---|---|---|
| **Modo A** (padrão) | `NULL` | número da plataforma (env) | não achou tenant pelo `phone_number_id` → resolve pelo telefone do morador (como hoje) |
| **Modo B** (dedicado) | preenchido, único | o próprio | `phone_number_id → tenant`, exato |

Isso significa que **a decisão não precisa ser tomada de uma vez, nem para
sempre**. Um condomínio que cresce, que exige marca própria, ou que passa a ser
um risco de qualidade, ganha número dedicado com um `UPDATE` e um registro de
número na Meta — sem deploy.

### Por que A como padrão

1. **É a única que preserva o onboarding.** O produto vende "assine e comece a
   usar". Nas opções B e C, cadastrar um condomínio deixa de ser um formulário e
   passa a ser um processo de dias com a Meta no caminho. Isso muda o produto, e
   não para melhor.
2. **A escala de B é ilusória.** 20 números por portfólio é pouco para um SaaS
   que quer crescer 10–100×. Multiplicar portfólios é multiplicar verificação de
   negócio, faturamento e operação — trabalho recorrente que não gera valor.
3. **C é tecnicamente elegante e comercialmente inviável para este público.**
   Exigir que o síndico crie Business Manager, verifique o CNPJ do condomínio e
   cadastre cartão na Meta é pedir para perder a venda.
4. **O risco da A é gerenciável, e é gerenciável *por código*.** O ponto único de
   falha é o quality rating, e ele degrada por denúncia de morador. O que gera
   denúncia é mensagem indesejada — e no Chegou **quem controla o que sai é a
   plataforma, não o condomínio**: templates fixos, opt-in registrado, `SAIR`
   respeitado, aviso categorizado e com teto. Nenhum síndico tem acesso ao número.

### Por que B fica disponível — e quando usar

Gatilhos objetivos para dar número dedicado a um condomínio:

- **Volume**: condomínio acima de ~1.000 mensagens/mês (concentra risco).
- **Marca**: administradora que exige o próprio nome como remetente (vira
  diferencial comercial pago).
- **Contenção**: condomínio com histórico de denúncia ou de uso pesado de avisos
  de categoria marketing — tirá-lo do número compartilhado protege os outros.
- **Contrato**: cliente que exige isolamento por escrito.

Com o teto de ~20 números por portfólio, isso comporta os 20 maiores clientes —
que é exatamente onde o isolamento vale a pena.

### O que precisa ser aceito junto com esta escolha

- **O remetente passa a ser "Chegou"** para a maioria dos condomínios. O nome do
  condomínio continua na primeira linha do texto, mas o contato no celular do
  morador muda. **Isso é uma mudança de produto e precisa da sua decisão** — item
  2 de [00-perguntas-abertas](00-perguntas-abertas.md).
- **O desempate de inbound ambíguo se perde** no modo A. Mitigação: quando o
  telefone estiver em mais de um condomínio, responder pedindo a unidade em vez
  de silenciar. É melhoria de produto, não regressão obrigatória.

---

## 6. Passo a passo da opção recomendada

Ordem importa: cada etapa destrava a seguinte. **Comece a etapa 2 hoje** — é a
única que depende de terceiro e a que mais atrasa projeto.

### Etapa 1 — Business Portfolio

1. [business.facebook.com](https://business.facebook.com) → **Criar conta**.
2. Nome legal **exatamente como no CNPJ** (não o nome fantasia). É contra este
   nome que os documentos serão conferidos.
3. E-mail corporativo **do domínio da empresa**. Gmail atrasa ou reprova a
   verificação.
4. Ative **2FA obrigatório para todos** em *Central de Contas → Segurança*.

> ⚠️ **Não reaproveite um Business Manager antigo** criado para anúncios com
> nome fantasia ou com pessoa física. Renomear depois é possível, mas cada
> divergência de nome vira uma rodada de reprovação.

### Etapa 2 — Verificação de negócio *(comece agora)*

1. *Configurações do negócio → Central de segurança → Iniciar verificação*.
2. Preencha razão social, endereço, telefone e site — **exatamente** como
   constam nos documentos.
3. Envie os documentos. A lista aceita é mostrada no próprio fluxo e **varia**;
   no Brasil, o par que costuma resolver é **comprovante de inscrição no CNPJ**
   (cartão CNPJ) + **comprovante de endereço em nome da empresa**. ⚠️ Trate esta
   lista como orientação, não como fato oficial — a Meta lista os tipos aceitos
   no momento da submissão. Item 12 de
   [00-perguntas-abertas](00-perguntas-abertas.md).
4. Verificação por telefone/e-mail do domínio, quando pedida.

**Prazo**: costuma levar de poucos dias a duas semanas; reprovação reinicia o
relógio.

**O que a verificação destrava**: o teto de números do portfólio sai de 2 e vai
para 20, e o caminho de tier 250 → 2.000 fica automático.

### Etapa 3 — App no Meta for Developers

1. [developers.facebook.com](https://developers.facebook.com) → **Meus apps →
   Criar app** → tipo **Negócios** → vincule ao portfólio da Etapa 1.
2. Adicione o produto **WhatsApp**.
3. Guarde **App ID** e **App Secret** — o secret é o que assina o webhook
   (`X-Hub-Signature-256`, [§7.1 do plano](01-plano-de-migracao.md#71-verificação-e-assinatura)).
4. Um app só atende toda a plataforma. Não crie um por ambiente **de produção**;
   crie **um app separado para homologação**, com WABA e número de teste
   próprios.

### Etapa 4 — WABA e número

1. No produto WhatsApp do app, crie a **WABA** (ela nasce dentro do portfólio).
2. Anote o **WABA ID**.
3. **Número de teste** já vem junto e é gratuito — use-o para as Fases 1 a 3 do
   plano.
4. Para o número de produção: *Adicionar número de telefone*.
   - Precisa receber **SMS ou chamada de voz** para o código.
   - **Não pode estar ativo no WhatsApp.** Se estiver, apague a conta WhatsApp
     daquele número **antes** (Configurações → Conta → Apagar conta), e espere.
   - Depois de registrado, o número continua servindo para ligação e SMS, mas
     **sai do WhatsApp Messenger para sempre** (na prática do uso diário).
5. **Display name**: para o modo A, use a marca — "Chegou". Passa por revisão;
   nome sem relação com o negócio verificado é recusado.
6. Anote o **`phone_number_id`**. É ele que roteia o webhook e identifica o
   remetente na API.

### Etapa 5 — System User e token

1. *Configurações do negócio → Usuários → Usuários do sistema → Adicionar*.
2. Nome: `chegou-api`. Função: **Administrador** (necessário para gerenciar
   templates; ver a nota de permissões abaixo).
3. **Atribuir ativos** → a WABA → **Controle total**.
4. **Gerar novo token** → selecione o app da Etapa 3 → permissões:

   | Permissão | Para quê |
   |---|---|
   | `whatsapp_business_messaging` | enviar mensagem, ler status |
   | `whatsapp_business_management` | criar/editar/ler templates, ler qualidade e tier |
   | `business_management` | ler dados do portfólio (só se for usar o painel de saúde) |

   **Não marque mais nada.** Token de System User **não expira**, então cada
   permissão a mais é permanente.
5. **Copie o token na hora** — ele não é mostrado de novo.
6. Guarde em `WHATSAPP_SYSTEM_USER_TOKEN`, no `.env` do servidor (nunca no
   banco, nunca no repositório, nunca no front).

> **Princípio do menor privilégio, na prática**: a Meta exige papel de
> Administrador do System User para gestão de templates. Compense do lado de
> fora: token só no servidor, rotação anotada no calendário, e um segundo System
> User **somente-leitura** para o painel de saúde, se ele existir.

### Etapa 6 — Webhook

1. No app → **WhatsApp → Configuração → Webhook → Editar**.
2. **URL de callback**: `https://chegou.bellory.com.br/api/webhooks/whatsapp`
3. **Token de verificação**: uma string aleatória forte, a mesma em
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. A Meta faz um `GET` com `hub.challenge` — a API precisa **já estar no ar**
   respondendo, senão o cadastro falha.
5. **Assine os campos**:

   | Campo | Por quê |
   |---|---|
   | `messages` | mensagens recebidas **e** status de entrega |
   | `message_template_status_update` | fecha o fluxo de aprovação de template |
   | `template_category_update` | recategorização mensal (afeta o custo!) |
   | `phone_number_quality_update` | alerta de qualidade caindo |
   | `account_update` | conta restrita/banida |
   | `user_preferences` | opt-out de marketing feito pelo morador |

6. Teste com o botão **Testar** de cada campo antes de seguir.

> ⚠️ **`/api/webhooks/whatsapp` precisa ser `@Public()`** e ficar fora do
> `JwtAuthGuard` — e a rota **não pode** estar atrás do redirect da landing. No
> nginx (`deploy/nginx/app.conf`), `/api/...` já vai para a API; confira que
> nenhuma regra nova intercepta.

### Etapa 7 — Templates

1. Submeta os 11 do [§5 do plano](01-plano-de-migracao.md#5-mapeamento-mensagem-atual--template-da-meta),
   via API (`POST /{waba-id}/message_templates`) — **não pela interface**. Pela
   API o payload fica versionado no repositório, que é o que permite recriar em
   outra WABA sem retrabalho.
2. **Sempre com `example`** em cada componente. Template sem exemplo é reprovado.
3. Categoria: submeta como `UTILITY` o que você acredita ser utility. Se a Meta
   reclassificar, você fica sabendo — e é essa a informação que falta para fechar
   o [02-custos](02-custos.md).
4. Análise: até 24 h, normalmente minutos.
5. Grave `meta_template_id`, `status` e **`category`** na tabela
   `whatsapp_templates` ([§6.2 do plano](01-plano-de-migracao.md#62-whatsapp_templates--o-catálogo-novo)).

### Etapa 8 — Forma de pagamento

1. *Configurações do negócio → Faturamento e pagamentos → Adicionar forma de pagamento*.
2. **Moeda**: BRL, se elegível — a Meta liberou WABAs em BRL para o Brasil a
   partir de 01/07/2026, faturadas pela Facebook Brasil. Evita IOF e variação
   cambial.
3. ⚠️ **Moeda e fuso da WABA travam quando o crédito é anexado.** Escolher USD
   "por enquanto" é uma decisão permanente.
4. Configure alerta de gasto. **Sem forma de pagamento válida, o envio para de
   funcionar sem aviso prévio útil.**

### Etapa 9 — Conferência final

```
[ ] Portfólio criado com a razão social exata do CNPJ
[ ] 2FA obrigatório ativo
[ ] Verificação de negócio APROVADA
[ ] App criado, App ID e App Secret guardados
[ ] WABA criada, WABA ID anotado
[ ] Número de produção registrado, phone_number_id anotado
[ ] Display name aprovado
[ ] System User com token de longa duração, 2 permissões, token no .env
[ ] Webhook verificado e com os 6 campos assinados
[ ] Os 11 templates submetidos; categoria REAL de cada um anotada
[ ] Forma de pagamento em BRL, com alerta de gasto
[ ] Uma mensagem de teste entregue num celular real (curl, fora do Chegou)
```

O último item é o critério de saída da Fase 0 do plano.

---

## 7. Escalonamento dos messaging limits

O número novo começa em **250 destinatários únicos por 24 h móveis**. No modo A,
isso é o teto da **plataforma inteira** no primeiro dia — e é por isso que a
ordem das fases do plano importa.

| Tier | Destinatários únicos / 24 h | Como se chega |
|---|---|---|
| 250 | 250 | inicial |
| 2.000 | 2.000 | **verificar o negócio** (Etapa 2) — ou entregar 2.000 mensagens a destinatários únicos em 30 dias com templates de boa qualidade |
| 10.000 | 10.000 | automático: usar **≥ metade** do limite atual em 7 dias, com qualidade alta |
| 100.000 | 100.000 | idem |
| Ilimitado | — | idem |

**Consequências práticas para o rollout:**

- A verificação de negócio (Etapa 2) **é o atalho** para o tier 2.000. Sem ela, é
  preciso *entregar* 2.000 mensagens estando limitado a 250/dia — o que leva
  semanas. Este é o motivo real de a Etapa 2 ser urgente.
- Cada degrau exige **usar metade do limite atual em 7 dias**. Migrar poucos
  condomínios e esperar não sobe o tier: é preciso volume constante. As ondas do
  plano existem por isso.
- 250/24 h significa que na Fase 4 (piloto) o condomínio precisa ter **menos de
  ~60 unidades** para caber com folga — inclusive num aviso geral.
- No modo B (número dedicado), **cada número recomeça do 250**. Dar número
  próprio a um condomínio grande **antes** de aquecê-lo é a receita para
  mensagens não entregues.

---

## 8. Armadilhas por etapa

| Etapa | Armadilha | Como evitar |
|---|---|---|
| Portfólio | Nome fantasia em vez da razão social | Copiar do cartão CNPJ, caractere por caractere |
| Portfólio | Reaproveitar Business Manager antigo de anúncios | Criar novo, limpo |
| Verificação | Endereço divergente entre formulário e documento | Conferir CEP, complemento e abreviações |
| Verificação | E-mail em domínio público (Gmail) | E-mail do domínio da empresa |
| Verificação | Reprovar e resubmeter na hora com o mesmo material | Ler o motivo; resubmissão idêntica reprova de novo |
| App | Usar o app de produção para testes | App separado de homologação, com número de teste |
| App | App Secret em variável do front | Só no servidor. Ele **assina** o webhook |
| Número | Registrar número que ainda está ativo no WhatsApp | Apagar a conta WhatsApp antes |
| Número | Usar o celular pessoal do síndico | Chip institucional; o número **sai do WhatsApp do aparelho** |
| Número | Não avisar o cliente que o número sai do app | Consta do checklist pré-migração do plano |
| Display name | Nome sem relação com o negócio verificado | No modo A, usar a marca. No modo B, prever recusa |
| System User | Token de usuário comum (expira em 60 dias) | **Sempre** System User; o token não expira |
| System User | Permissões demais "por segurança" | Só `whatsapp_business_messaging` + `whatsapp_business_management` |
| System User | Perder o token (só é mostrado uma vez) | Copiar direto para o cofre/`.env` |
| Webhook | Validar assinatura sobre o JSON parseado | Corpo **cru** (`rawBody: true`) |
| Webhook | Comparar assinatura com `===` | `timingSafeEqual` |
| Webhook | Processar tudo antes de responder | Grava, responde `200`, processa assíncrono |
| Webhook | Esquecer `template_category_update` | É ele que avisa que o custo do template mudou |
| Templates | Submeter sem `example` | Reprovação imediata |
| Templates | Criar pela interface | Perde versionamento; recriar noutra WABA vira trabalho manual |
| Templates | Confiar na categoria submetida para calcular custo | Usar `category_current`, vinda da API |
| Pagamento | Escolher USD "por enquanto" | Moeda trava com o crédito. BRL desde o começo |
| Pagamento | Sem alerta de gasto | Um aviso geral mal categorizado vira surpresa na fatura |
| Tier | Migrar condomínio grande cedo | Tier 250 não entrega aviso para 300 unidades |

---

## Ao alterar este documento

- [ ] Mudou a arquitetura escolhida → reveja §7.2 e §6.1 do
      [plano](01-plano-de-migracao.md) (roteamento e schema) e a seção de
      onboarding de condomínio novo.
- [ ] Meta mudou um limite → atualize §2 **com a data da nova consulta**. Limite
      sem data é limite que ninguém sabe se ainda vale.
- [ ] Concluiu uma etapa → registre o ID gerado (WABA ID, `phone_number_id`) num
      lugar seguro, **não aqui** — este arquivo vai para o Git.
