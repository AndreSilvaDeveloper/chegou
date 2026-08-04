# Perguntas abertas — migração para a Cloud API

> Tudo o que depende de você, e tudo o que faltou para completar a análise.
> Ordenado por **quanto trava o trabalho**, não por assunto.
> **Data**: 04/08/2026.

Legenda: 🔴 **bloqueia** um entregável · 🟠 **muda o desenho** se a resposta for
outra · 🟡 detalhe a confirmar antes de codar.

---

## Sumário

- [A. Bloqueadores](#a-bloqueadores)
- [B. Decisões de produto e negócio](#b-decisões-de-produto-e-negócio)
- [C. A confirmar com a Meta](#c-a-confirmar-com-a-meta-teste-empírico-ou-suporte)
- [D. Informações que faltaram no código](#d-informações-que-faltaram-no-código)
- [E. Detalhes técnicos menores](#e-detalhes-técnicos-menores)
- [Resumo: o caminho crítico](#resumo-o-caminho-crítico)

---

## A. Bloqueadores

### 🔴 A1 — Tabela de preços oficial da Meta

**O que preciso**: as tarifas BRL por categoria, do rate card oficial.

- [developers.facebook.com/docs/whatsapp/pricing](https://developers.facebook.com/docs/whatsapp/pricing)
  → seção de rate cards → **BRL rates (CSV)** e **BRL volume tiers (CSV)**;
- ou a calculadora em
  [whatsappbusiness.com/pt-br/products/platform-pricing](https://whatsappbusiness.com/pt-br/products/platform-pricing/),
  com **Mercado = Brasil** e **Moeda = BRL**, nas quatro categorias.

**Por que não consegui**: a Meta publica os valores em CSV/PDF de download e numa
calculadora JavaScript. Nenhum dos dois é legível pelas ferramentas disponíveis.
A **estrutura** do preço (o que é cobrado, o que é grátis, o que mudou) veio toda
de fonte oficial e está em [02-custos §1 e §2](02-custos.md).

**Encontrei valores em blogs de terceiros e deliberadamente não os usei** — não
são fonte oficial, divergem entre si, e um preço errado num documento de custo é
pior que nenhum preço.

**O que destrava**: o [02-custos](02-custos.md) inteiro. Preenchendo o §3 daquele
documento, os §6 e §7 passam a produzir números — a aritmética já está pronta.

**Anote junto**: a **data de vigência** que vem no arquivo. Tarifa sem data não
tem validade.

---

### 🔴 A2 — Volume real da operação

**O que preciso**: o resultado das cinco consultas SQL do
[§1.4 do plano](01-plano-de-migracao.md#14-volume-e-picos), rodadas no Postgres
de produção. Elas devolvem, nesta ordem:

1. condomínios ativos e moradores notificáveis;
2. mensagens/mês por tipo, nos últimos 12 meses;
3. concentração por hora do dia;
4. distribuição por condomínio (o maior define o tier necessário);
5. quantas mensagens **entram** (define quanto cai na faixa gratuita).

**Por que não consegui**: **não há nenhum dado de volume no código** — nem
métrica, nem agregado, nem seed representativo. O que existe são os *limites
configurados* (100 msg/dia por condomínio, 60 s entre mensagens), que são teto e
não uso.

**O que destrava**: a linha "Atual" da projeção do
[02-custos §6](02-custos.md#6-projeção-por-faixa-de-volume) e os parâmetros 🟡 do
§5.1 — hoje são hipóteses explícitas, e **nenhuma projeção vale antes de trocá-las**.
Também define qual condomínio serve de piloto na Fase 4.

---

## B. Decisões de produto e negócio

### 🟠 B1 — O remetente passa a ser "Chegou"?

A arquitetura recomendada ([03-setup §5](03-setup-conta-meta.md#5-recomendação))
é **um número único da plataforma**. Consequência: o morador deixa de receber a
mensagem do número do condomínio e passa a recebê-la de um número do Chegou, com
display name "Chegou". O nome do condomínio continua na primeira linha do texto.

**As alternativas e o que custam**:

| Escolha | Custo |
|---|---|
| Número único ("Chegou") | Perde a identidade do condomínio como remetente |
| Número por condomínio | Onboarding de dias por condomínio, e **teto de ~20 números por portfólio** |

**Recomendação**: número único como padrão, e número dedicado como **item
comercial** para os grandes. Os dois modos são o **mesmo código** — muda só se
`tenants.phone_number_id` está preenchido.

**Pergunta**: aceita a mudança de remetente para a maioria da base?

---

### 🟠 B2 — Aviso de tipo "evento" e "geral" vira marketing. E daí?

A diretriz da Meta classifica como **marketing** o template cujo conteúdo é
genérico. `aviso_geral` e `aviso_evento` caem aí quase com certeza — e marketing
custa **~9× utility** 🟡 e é cobrado **mesmo dentro da janela de 24 h**.

Pela projeção, os avisos respondem por **~70 % da conta** no cenário base
([02-custos §7](02-custos.md#7-análise-de-sensibilidade)).

**Opções**:

1. Aceitar o custo, mostrando o preço na tela do síndico antes de enviar.
2. Tirar `geral`/`evento` do WhatsApp (viram só painel/e-mail).
3. Cobrar o aviso de categoria marketing à parte, como consumo.

**Pergunta**: qual das três? A resposta muda a tela de avisos e o modelo de
assinatura.

---

### 🟠 B3 — O que acontece com a personalização de template pelo síndico?

Hoje o síndico edita o texto em `/whatsapp` e vale no próximo envio. Na Cloud API,
cada edição vira submissão com até 24 h de análise e pode ser **rejeitada**.

Alternativas em [01-plano §3.2](01-plano-de-migracao.md#32-templates-editáveis-pelo-condomínio).
Recomendação: **fluxo de aprovação no painel** (rascunho → em análise → aprovado),
enviando a versão aprovada anterior enquanto a nova não sai.

**Pergunta**: mantém a personalização com espera de aprovação (5–8 dias de
desenvolvimento), ou simplifica para um catálogo de variantes prontas?

---

### 🟠 B4 — Opt-in: como tratar a base já existente?

Hoje `receber_whatsapp` nasce `true` — é opt-**out**. A Meta exige opt-in
registrado para mandar template.

Proposta em [01-plano §3.3](01-plano-de-migracao.md#33-opt-in): registrar
`optin_at`/`optin_origem`, checkbox **não pré-marcado** no autocadastro, e
processar `SAIR` no inbound (**que hoje não existe**).

Para a base legada, não dá para pedir consentimento sem já mandar mensagem. A
saída realista é marcar os existentes como `origem = 'legado'` e usar o rodapé de
opt-out nas mensagens que eles já esperam.

**Pergunta**: isso está de acordo com a orientação jurídica de vocês? Há
consentimento em algum outro lugar (contrato com o condomínio, regimento) que
sirva de base?

---

### 🟠 B5 — O custo de WhatsApp entra na assinatura como?

O custo é **por morador notificável/mês**; a assinatura cobra **por
apartamento** (`assinatura_faixas`). Não são a mesma unidade — um apartamento tem
mais de um morador cadastrado, e nem todos recebem.

Sem a razão real (moradores notificáveis ÷ apartamentos, consulta 1 de A2), não
dá para dizer se a margem atual absorve o custo.

**Pergunta**: o custo entra na margem, vira repasse por consumo, ou motiva um
reajuste das faixas? E há teto de mensagens por plano?

---

### 🟠 B6 — Números novos ou portar os existentes?

Registrar um número na Cloud API **o remove do WhatsApp Messenger**. Se o
condomínio usa aquele número no celular da portaria para outra coisa, ele perde.

E, mais importante: **a janela de rollback fecha ao portar**
([01-plano §9.5](01-plano-de-migracao.md#95-a-janela-de-rollback-fecha--e-é-preciso-saber-quando)).
Com número novo, voltar para o OpenWA é um `UPDATE`; com número portado, é um
processo com horas de indisponibilidade.

**Recomendação**: número novo nas fases 4 e 5. Custa um chip e compra a
reversibilidade da fase inteira.

**Pergunta**: de acordo? Quem paga o chip — Chegou ou condomínio?

---

## C. A confirmar com a Meta (teste empírico ou suporte)

### 🟡 C1 — A Meta aprova os avisos como utility?

**Como responder**: submeter os cinco templates de aviso na **Fase 1 do plano** e
ler a categoria devolvida. Custa ~2 dias e **elimina a maior incerteza financeira
do projeto** ([02-custos §7-①](02-custos.md#as-três-conclusões)).

Não dá para responder por leitura de documentação — a diretriz é interpretativa.

---

### 🟡 C2 — O teto de 20 números por portfólio é elevável?

A documentação diz que portfólios novos começam com 2 números e sobem
automaticamente para **20** com a verificação de negócio. **Não diz** se dá para
passar de 20 via suporte.

**Impacto**: se for elevável, a arquitetura B (um número por condomínio) volta a
ser viável em escala e a recomendação do doc 03 merece revisão.

**Como responder**: abrir chamado com o suporte da Meta depois de a WABA existir.

---

### 🟡 C3 — Display name do condomínio numa WABA verificada como Chegou

No modo B, o display name seria "Residencial Aurora" num número que pertence a
uma WABA verificada como "Chegou Tecnologia LTDA". A Meta revisa display names e
exige relação com o negócio verificado. **Pode recusar.**

É o risco mais subestimado da opção B, e não há como saber sem submeter.

---

### 🟡 C4 — Nono dígito brasileiro na Cloud API

Hoje o sistema testa o número **com e sem o 9** (`stripBrazilNinthDigit`) usando
`contacts/check`, que **não existe** na Cloud API.

**A confirmar empiricamente**, na Fase 1, com números reais de DDDs diferentes
(São Paulo, interior, região Norte): a Cloud API normaliza sozinha, ou devolve
`131026` para a variação errada?

**Impacto**: se não normalizar, volta a lógica de candidatos — e, sem
`contacts/check`, ela fica cara (dois envios, com o risco de entregar duplicado).

---

### 🟡 C5 — Limite de caracteres do corpo hidratado

O Pix copia-e-cola tem 150–300 caracteres e entra como variável no template
`cobranca_vaga_pix`. Estourar o limite dá erro `132005` **no envio**, não na
aprovação.

**A confirmar**: o limite do corpo depois de substituídas as variáveis. Testar
com um Pix real na Fase 1.

---

### 🟡 C6 — Cota do número de teste da Meta

A WABA nova ganha um número de teste gratuito com destinatários cadastrados.
**A confirmar**: cota de mensagens e quantos destinatários no modelo atual —
define se as Fases 1 a 3 cabem no teste ou já consomem verba.

---

### 🟡 C7 — Documentos de verificação de negócio no Brasil

O [03-setup, Etapa 2](03-setup-conta-meta.md#etapa-2--verificação-de-negócio-comece-agora)
sugere **cartão CNPJ + comprovante de endereço em nome da empresa**. Não consegui
acessar a página oficial da Meta com a lista aceita — está marcado como
orientação, não como fato.

**Como responder**: o próprio fluxo do Business Manager lista os tipos aceitos no
momento da submissão. Conferir lá antes de enviar qualquer coisa.

---

### 🟡 C8 — Mudança de tarifa em 01/10/2026

A Meta anunciou atualização de tarifas para **01/10/2026**. O rollout previsto
leva de 4 a 6 meses e **atravessa essa data**.

**Ação**: refazer a projeção quando o rate card novo sair.

---

## D. Informações que faltaram no código

### 🔴 D1 — Volume e picos

Ver [A2](#-a2--volume-real-da-operação). Repetido aqui porque é a lacuna mais
citada nos três documentos.

### 🟡 D2 — Histórico de banimento

O [02-custos §8.2](02-custos.md#82-o-custo-do-banimento) decompõe o custo do
risco, mas falta o dado que o torna um número: **quantos números foram bloqueados
nos últimos 12 meses, sobre quantos condomínios-ano?**

E, junto: **quantas horas** custou cada incidente, e **algum condomínio cancelou
por causa disso?** O termo de churn é o que domina a conta — e é o único
argumento que sobrevive mesmo se a Cloud API sair mais cara.

### 🟡 D3 — Custo real da infraestrutura do OpenWA

Preencher a tabela do [02-custos §8.1](02-custos.md#81-onde-está-o-custo-hoje):
custo do servidor do gateway, horas/mês de manutenção, horas/mês de suporte de
reconexão, custo dos chips.

Sem isso não há ponto de equilíbrio, só a **forma** das curvas — que já é
informativa, mas não é um número.

---

## E. Detalhes técnicos menores

### 🟡 E1 — Template morto `encomenda_chegou`

`whatsapp/templates.ts` define `encomenda_chegou`, com teste em
`templates.spec.ts`, mas **nada o envia** — a chegada usa o template
personalizável desde que ele existe. O nome sobrevive como valor histórico em
`whatsapp_messages.template_name`, consultado em `encomendas.service.ts:55`.

**Pergunta**: remover na migração (mantendo a consulta ao histórico) ou deixar
como está? Não migrar para a Meta em nenhuma hipótese.

### 🟡 E2 — Guarda de tokens, se a arquitetura C for reaberta

Na arquitetura C (uma WABA por condomínio) há **um token por cliente**, que
precisa de armazenamento criptografado, rotação e revogação. É superfície de
segurança nova.

Só vira pergunta se a recomendação do doc 03 for revista. Registrado para não se
perder.

### 🟡 E3 — Nomenclatura: CondoAvisa ou Chegou?

O pedido usa **CondoAvisa**; o repositório, o `CLAUDE.md`, o `package.json` e
toda a documentação usam **Chegou**. Os três documentos foram escritos com
*Chegou*, para não divergir do resto.

**Pergunta**: houve mudança de nome do produto? Se sim, é uma renomeação bem
maior que estes documentos — e vale uma tarefa própria.

### 🟡 E4 — Contagem de destinatários únicos

O messaging limit conta **destinatários únicos em 24 h móveis**; a cota de hoje
conta **mensagens**. São coisas diferentes: três encomendas para o mesmo morador
são 3 mensagens e 1 destinatário.

Não é pergunta, é aviso: é a mudança mais sutil da migração e a mais fácil de
implementar errado. Está em
[01-plano §8.4](01-plano-de-migracao.md#84-rate-limiting-do-nosso-lado).

---

## Resumo: o caminho crítico

Na ordem em que destravam mais coisa:

| # | Item | Quem responde | Destrava |
|---|---|---|---|
| 1 | **Iniciar a verificação de negócio na Meta** ([03-setup, Etapa 2](03-setup-conta-meta.md#etapa-2--verificação-de-negócio-comece-agora)) | você, **hoje** | Tudo. Leva dias a semanas e é o único item que depende de terceiro |
| 2 | [A1](#-a1--tabela-de-preços-oficial-da-meta) — tabela de preços | você (colar) | O [02-custos](02-custos.md) inteiro |
| 3 | [A2](#-a2--volume-real-da-operação) — volume real (5 consultas SQL) | você (rodar) | As projeções e a escolha do piloto |
| 4 | [C1](#-c1--a-meta-aprova-os-avisos-como-utility) — categoria dos avisos | Fase 1 do plano (~2 dias) | A maior incerteza financeira |
| 5 | [B1](#-b1--o-remetente-passa-a-ser-chegou) — remetente | você | A arquitetura de contas |
| 6 | [B2](#-b2--aviso-de-tipo-evento-e-geral-vira-marketing-e-daí) e [B3](#-b3--o-que-acontece-com-a-personalização-de-template-pelo-síndico) — política de avisos e personalização | você | Escopo de duas telas (8–13 dias) |

> **O item 1 não espera pelos outros.** A verificação de negócio é pré-requisito
> do tier 2.000 e é a única etapa cujo prazo não está nas suas mãos. Começar hoje
> custa uma hora e economiza semanas depois.
