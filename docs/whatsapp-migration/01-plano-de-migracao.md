# Plano de migração — OpenWA → WhatsApp Business Platform (Cloud API)

> **Nota de nomenclatura**: o pedido usa o nome **CondoAvisa**; o repositório, o
> `CLAUDE.md` e o `package.json` usam **Chegou**. Este documento usa *Chegou*,
> para não divergir do resto da documentação. Ver
> [00-perguntas-abertas.md](00-perguntas-abertas.md), item 1.

> **Status**: proposta. Nenhuma linha de código foi alterada.
> **Data**: 04/08/2026 · **Versão do sistema no levantamento**: 0.31.3

---

## Sumário

1. [O que existe hoje](#1-o-que-existe-hoje)
2. [Diferenças funcionais OpenWA × Cloud API](#2-diferenças-funcionais-openwa--cloud-api)
3. [Gaps de paridade e alternativas](#3-gaps-de-paridade-e-alternativas)
4. [Arquitetura proposta](#4-arquitetura-proposta)
5. [Mapeamento: mensagem atual → template da Meta](#5-mapeamento-mensagem-atual--template-da-meta)
6. [Mudanças no schema do banco](#6-mudanças-no-schema-do-banco)
7. [Webhooks](#7-webhooks)
8. [Erros e rate limiting](#8-erros-e-rate-limiting)
9. [Rollout em fases](#9-rollout-em-fases)
10. [Estratégia de testes](#10-estratégia-de-testes)
11. [Estimativa de esforço](#11-estimativa-de-esforço)

---

## 1. O que existe hoje

Levantamento feito diretamente no código (Fase 0). Serve de linha de base — cada
item aqui é um ponto que a migração toca.

### 1.1 Pontos de acoplamento com o OpenWA

| Arquivo | Papel | O que a migração faz com ele |
|---|---|---|
| `src/modules/openwa/openwa.client.ts` | Cliente REST do gateway (`/sessions`, `/webhooks`, `/contacts/check`, `/messages/send-text`) | Fica intacto, passa a ser um dos dois providers |
| `src/modules/openwa/openwa.service.ts` | Orquestra sessão (provisionar, QR, status, restart) **e** é o **único caminho de envio** (`sendText`). Também guarda `getWhatsappConfig`/`updateWhatsappConfig` | Quebra em dois: a parte de sessão fica no provider OpenWA; a config de template/ritmo **sai daqui** e vira neutra de provedor |
| `openwa-connection.controller.ts` · `openwa-config.controller.ts` · `admin-tenant-whatsapp.controller.ts` | REST do painel (conexão, config, escopo plataforma) | `connection` passa a ser polimórfico (QR no OpenWA, status da WABA na Cloud API) |
| `src/modules/notificacoes/notification-dispatcher.service.ts` | Consome a fila e chama `openwa.sendText(...)`. Trata `WhatsappNumberNotFoundError` como falha terminal | Passa a chamar `MessagingProvider.send(...)`; ganha o mapa de erros da Cloud API |
| `src/modules/whatsapp/whatsapp.service.ts` | Histórico + **resposta automática**, que chama `openwa.sendText` **direto, sem fila** | Passa pelo provider; na Cloud API essa é uma *session message* (grátis, dentro da janela) |
| `src/modules/whatsapp/webhook-openwa.controller.ts` | `POST /webhooks/openwa/:tenantId`, `@Public()` | Ganha um irmão: `POST /webhooks/whatsapp` (um só para toda a plataforma) |
| `src/modules/whatsapp/inbound-openwa.parser.ts` | Traduz o payload do gateway | Ganha um irmão: `inbound-cloud-api.parser.ts` |
| `src/modules/admin/admin.service.ts` · `administradoras.service.ts` | Chamam `provisionForTenant` na criação do condomínio (best-effort) | Provisionamento passa a depender do provider do tenant |
| `src/database/entities/tenant.entity.ts` | `whatsapp_session_id`, `whatsapp_session_name`, `whatsapp_status`, `whatsapp_numero` (migration `017`) | Ganha as colunas da Cloud API (§6) |
| `src/database/entities/whatsapp-message.entity.ts` | Histórico; `provider` hoje é sempre `'openwa'` (constante `PROVIDER`) | A constante vira valor por linha (`openwa` \| `cloud_api`) |
| `src/config/env.validation.ts` · `.env.example` · `deploy/docker-compose.yml` | `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_PREFIX`, `OPENWA_WEBHOOK_BASE_URL`, `OPENWA_TIMEOUT_MS` | Ganham o bloco `WHATSAPP_*` da Cloud API |
| `web/src/pages/Whatsapp.tsx`, `components/Whatsapp{Connection,Template,Envio}Card.tsx`, `components/whatsapp/TemplateEditor.tsx`, `components/condominio/WhatsappCondominioPanel.tsx` | Telas de conexão, modelos e ritmo (o mesmo painel em `/whatsapp`, `/admin/condominios/:id` e `/meus-condominios/:id`) | O card de conexão vira dois modos; o de modelos vira fluxo de aprovação (§3.2) |

**Módulos que importam `OpenwaModule`**: `app.module`, `notificacoes.module`,
`whatsapp.module`, `admin.module`. A dependência é sempre num sentido só
(`whatsapp → openwa`), o que facilita: basta trocar o que está na ponta.

**Tratamento de erro/reconexão hoje**:

- Timeout duro por chamada (`OPENWA_TIMEOUT_MS`, 15 s) — worker preso é fila parada.
- `OpenWaNotConnectedError` (sessão caída) → retriável, o BullMQ reagenda com backoff.
- `WhatsappNumberNotFoundError` (número não existe no WhatsApp) → **terminal**, falha direto.
- Reconexão é **manual**: o síndico abre `/whatsapp` e lê o QR de novo.
- Cache: status da sessão 30 s (`wa:sess:{tenant}`), JID do destinatário 30 dias
  (`wa:jid:{tenant}:{numero}`) — falha no envio apaga a chave do JID.

### 1.2 Multi-tenant hoje

- **Uma sessão OpenWA por condomínio**, nome derivado do slug
  (`{OPENWA_SESSION_PREFIX}-{tenant.slug}`, sanitizado para `[a-z0-9-]`, 3–50 chars).
- Provisionada na criação do condomínio (best-effort, engole erro) e também de
  forma preguiçosa no primeiro `getConnection`.
- **Credenciais**: existe **uma** chave global (`OPENWA_API_KEY`) para falar com o
  gateway. A credencial de *sessão* do WhatsApp (o pareamento do WhatsApp Web)
  vive **dentro do gateway OpenWA**, não no nosso banco. Guardamos só
  `whatsapp_session_id`, `whatsapp_session_name`, `whatsapp_status` e
  `whatsapp_numero`.
- **Isolamento**: `tenant_id` em toda tabela; chaves Redis por tenant
  (`wa:slot:`, `wa:cota:`, `wa:envio:`, `wa:sess:`, `wa:jid:`); a URL do webhook
  carrega o `tenantId`.
- **Ponto frágil conhecido**: o dono de uma mensagem recebida é resolvido pelo
  **telefone do remetente**, não pelo `tenantId` da URL. Mesmo telefone em dois
  condomínios → desempate pelo número de destino (`tenants.whatsapp_numero`); sem
  desempate, a mensagem fica **sem condomínio**. Na Cloud API isso melhora
  sozinho (§7.2).

### 1.3 Mensagens que o sistema envia hoje

Seis textos distintos. Os dois primeiros são editáveis pelo condomínio; os
outros são fixos no código.

| # | Mensagem | Origem | Personalizável? | Fila? |
|---|---|---|:---:|:---:|
| 1 | Encomenda chegou | `encomendas.service.ts` → `DEFAULT_TEMPLATE_ENCOMENDA` | ✅ (`whatsappTemplateEncomenda`) | ✅ |
| 2 | Encomenda retirada | `encomendas.service.ts` → `DEFAULT_TEMPLATE_RETIRADA` | ✅ (`whatsappTemplateRetirada`) | ✅ |
| 3 | Aviso do condomínio | `avisos.service.ts` — **texto livre digitado pelo síndico** | — (é 100 % livre) | ✅ |
| 4 | Cobrança de vaga | `vagas/cobranca-template.ts` → `montarMensagemCobranca` | ❌ | ✅ |
| 5 | Cobrança de condomínio | `apartamentos.service.ts`, string inline | ❌ | ✅ |
| 6a | Lembrete de código (resposta) | `whatsapp/templates.ts` → `lembrete_codigo` | ❌ | ❌ **direto** |
| 6b | Sem encomenda pendente (resposta) | `whatsapp/templates.ts` → `sem_encomenda_pendente` | ❌ | ❌ **direto** |

> **Achado**: `whatsapp/templates.ts` ainda define `encomenda_chegou`, com teste
> em `templates.spec.ts`, mas **nada o envia** — a chegada passou a usar o
> template personalizável (#1). O nome sobrevive como valor histórico em
> `whatsapp_messages.template_name`, consultado em `encomendas.service.ts:55`.
> Não migrar; ver [00-perguntas-abertas.md](00-perguntas-abertas.md), item 8.

Textos e variáveis de cada um estão em [§5](#5-mapeamento-mensagem-atual--template-da-meta).

### 1.4 Volume e picos

**Não há nenhum dado de volume no código** — nem métrica, nem tabela agregada,
nem seed representativo. O que existe são os *limites configurados*, que são teto,
não uso:

| Parâmetro | Padrão (`DEFAULT_TENANT_CONFIG`) | Faixa que o síndico escolhe |
|---|---|---|
| Intervalo entre mensagens | 60 s | ≥ 60 s, até 3600 s |
| Jitter | 60 s | só o superadmin edita |
| Limite diário por condomínio | **100/dia** | 20 a 300 |
| Janela de envio | 08:00–21:00 | dentro de 08:00–21:00 |
| Condomínios enviando em paralelo | 15 (`NOTIFICATION_CONCURRENCY`) | env |

Teto teórico da plataforma hoje: `nº de condomínios × limiteDiario`, com o piso
de 60 s + jitter entre mensagens do mesmo número — o que dá, na janela de 13 h,
**~390 mensagens/dia por condomínio** de capacidade física, bem acima do limite
padrão de 100. Ou seja: **quem limita hoje é a configuração, não a infra.**

**Onde obter o número real** (rodar no Postgres de produção):

```sql
-- 1) Condomínios ativos e moradores com WhatsApp
SELECT count(*) FILTER (WHERE ativo)                         AS condominios_ativos,
       (SELECT count(*) FROM moradores WHERE ativo AND receber_whatsapp
          AND telefone_e164 IS NOT NULL)                     AS moradores_notificaveis
FROM tenants;

-- 2) Mensagens por mês, por tipo (últimos 12 meses)
SELECT date_trunc('month', created_at) AS mes, tipo, count(*)
FROM notificacoes
WHERE status = 'enviada'
GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;

-- 3) Concentração por hora do dia (pico) — fuso local
SELECT extract(hour FROM enviada_at AT TIME ZONE 'America/Sao_Paulo') AS hora,
       count(*)
FROM notificacoes
WHERE status = 'enviada' AND enviada_at > now() - interval '90 days'
GROUP BY 1 ORDER BY 1;

-- 4) Distribuição por condomínio (para dimensionar o pior caso)
SELECT tenant_id, count(*) AS msgs_30d
FROM notificacoes
WHERE status = 'enviada' AND created_at > now() - interval '30 days'
GROUP BY 1 ORDER BY 2 DESC LIMIT 20;

-- 5) Quantas mensagens ENTRAM (define o peso da janela de 24 h)
SELECT date_trunc('month', created_at) AS mes, direction, count(*)
FROM whatsapp_messages GROUP BY 1, 2 ORDER BY 1 DESC;
```

A consulta 3 responde "horários de concentração"; a 5 é a que decide quanto da
conta cai na janela gratuita (§ [02-custos](02-custos.md)).

### 1.5 Fluxos bidirecionais

**Sim, o sistema recebe e responde.**

- Webhook `POST /webhooks/openwa/:tenantId` recebe `message.received`.
- `inbound-openwa.parser.ts` traduz o payload (defensivo: o gateway não tem
  contrato estável entre versões).
- `recordInbound` grava em `whatsapp_messages`, idempotente por
  `providerMessageId`; eco (`fromMe`) é descartado.
- `handleInboundIntent` faz **detecção de intenção por regex**:
  `/(retirar|vou retirar|estou indo|cheguei|chegando|ok|sim)/i` ou
  `/(codigo|código)/i` → responde com o código pendente (`lembrete_codigo`) ou
  com `sem_encomenda_pendente`.
- A resposta **não segura o webhook** (roda solta, loga a falha): demorar faz o
  gateway reentregar, e reentrega vira mensagem duplicada.

**Não existe** botão, lista, quick reply nem qualquer mensagem interativa. Toda
interação é texto puro. `whatsapp_messages.message_type` já prevê
`'interactive'`, mas nada o produz.

---

## 2. Diferenças funcionais OpenWA × Cloud API

Todas as regras abaixo foram conferidas na documentação oficial da Meta em
**04/08/2026** (links no fim da seção).

| Dimensão | OpenWA (hoje) | Cloud API |
|---|---|---|
| **Conteúdo da mensagem** | Qualquer texto, a qualquer hora | Fora da janela de 24 h, **só template pré-aprovado**. Dentro dela, texto livre |
| **Aprovação** | Nenhuma. Muda o texto, vale no próximo envio | Cada template passa por revisão (**até 24 h**); editar = nova revisão |
| **Janela de atendimento** | Não existe | 24 h a partir da **última mensagem do usuário**. Fechada → erro `131047` |
| **Opt-in** | Convenção interna (`receber_whatsapp`) | **Exigido pela política da Meta**, com registro de quando/como/onde |
| **Limite de envio** | Que a gente impuser (anti-bloqueio) | *Messaging limit* por número: **250 → 2.000 → 10.000 → 100.000 → ilimitado** destinatários únicos por 24 h móveis |
| **Throughput** | ~1 msg/60 s por condomínio (autoimposto) | **80 msg/s por número**, com upgrade disponível |
| **Qualidade** | Invisível até o número cair | *Quality rating* por número + qualidade por template, com pausa automática |
| **Risco de banimento** | **Alto** — é a razão desta migração | Baixo; a punição é degradar tier / pausar template, não sumir com o número |
| **Status de entrega** | Praticamente nenhum (o evento `message.ack` é registrado no gateway mas o parser não o trata) | `sent` · `delivered` · `read` · `failed` por webhook |
| **Provisionamento** | QR na tela, o síndico lê com o celular | Número registrado na WABA (some do app WhatsApp) ou Embedded Signup |
| **Número existe no WhatsApp?** | `contacts/check` antes de enviar (com/sem o 9º dígito) | **Não há endpoint equivalente**; envia-se em E.164 e o erro volta como `131026` |
| **Custo** | Infra + risco | Por mensagem entregue, por categoria (ver [02-custos](02-custos.md)) |
| **Estabilidade** | Quebra a cada atualização do WhatsApp Web | Contrato versionado (Graph API `v2x.0`) |

### 2.1 As quatro limitações que hoje não existem

**① Templates pré-aprovados.** Toda mensagem iniciada pelo negócio (todas as 5
primeiras da tabela §1.3) vira um template cadastrado na WABA, com categoria,
idioma e variáveis posicionais (`{{1}}`, `{{2}}`…). O texto fica **congelado**
até nova aprovação; só as variáveis mudam.

> **Regra que morde o Chegou**: pela diretriz da Meta, template cujo conteúdo é
> genérico ou majoritariamente variável é classificado como **marketing**. Um
> template `"{{1}}"` para o aviso livre do síndico cai exatamente aí — e
> marketing custa ~9× o utility. Ver [§3.1](#31-aviso-livre-do-síndico).

**② Janela de 24 h.** Abre quando o **morador** escreve; fecha 24 h depois.
Dentro dela: texto livre, sem template, e utility **sem custo**. Fora dela: só
template, e template utility é cobrado.

**③ Opt-in.** A Meta exige que o negócio tenha permissão registrada antes de
mandar template. Hoje o `receber_whatsapp` **nasce `true`** (inclusive no
autocadastro, por decisão de produto explícita no `AutocadastroMoradorDto`) — é
opt-**out**, não opt-in. Isso precisa mudar (§3.3).

**④ Messaging limits e quality rating.** O número novo começa em **250**
destinatários únicos/24 h. Sobe para 2.000 verificando o negócio (ou entregando
2.000 mensagens em 30 dias com templates de boa qualidade); daí para cima é
automático, exigindo usar **metade do limite atual em 7 dias** com qualidade
alta. Qualidade baixa pausa templates (`132015`) e, reincidindo, desabilita
(`132016`).

> **Implicação direta na arquitetura escolhida no [03-setup-conta-meta](03-setup-conta-meta.md)**:
> tier e quality rating são **por número**. Um número por condomínio dá
> isolamento (um condomínio ruim não derruba os outros) mas obriga **cada** número
> a escalar seu tier do zero — um condomínio de 300 unidades não cabe em 250/24 h
> no primeiro dia de um aviso geral.

**Fontes** (consultadas em 04/08/2026):
[Pricing](https://developers.facebook.com/docs/whatsapp/pricing) ·
[Messaging limits](https://developers.facebook.com/docs/whatsapp/messaging-limits) ·
[Error codes](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/) ·
[Template guidelines](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines) ·
[Cloud API overview](https://developers.facebook.com/docs/whatsapp/cloud-api/overview)

---

## 3. Gaps de paridade e alternativas

O que o sistema faz hoje e **não** vai dar para fazer igual.

### 3.1 Aviso livre do síndico

**Hoje**: o síndico digita o comunicado inteiro em `/avisos` e ele sai como está,
para todos os moradores (ou de um bloco/unidade).

**Na Cloud API**: aviso é business-initiated fora da janela → precisa de
template. Texto arbitrário não passa por template aprovado.

**Este é o maior gap da migração.** Três alternativas, em ordem de preferência:

| # | Alternativa | Como fica | Custo/categoria | Risco |
|---|---|---|---|---|
| **A** | **Template por tipo de aviso** — o `avisos` já tem `tipo` (geral, urgente, manutenção, evento, financeiro). Um template por tipo, com moldura fixa + `{{1}}` para o corpo | `"🔧 *Manutenção no {{1}}*\n\n{{2}}\n\n— {{3}}"` | manutenção/urgente têm chance real de **utility** (essencial/crítico); evento é **marketing** | Recategorização mensal automática da Meta pode empurrar para marketing |
| **B** | **Template único genérico** com `{{1}}` = corpo inteiro | Menos trabalho, 1 template | **Marketing quase certo** (a diretriz classifica conteúdo genérico/placeholder como marketing) | Custo ~9× e sujeito ao limite de marketing (`131049`) |
| **C** | **Aviso deixa de ser WhatsApp** — vira notificação no painel/PWA + e-mail | Custo zero de mensagem | — | Perde o alcance, que é a razão de o produto existir ("o morador não baixa app") |

**Recomendação**: **A**, com uma regra de produto nova — o síndico escolhe o tipo
e o tipo decide o template *e o custo*. A tela precisa dizer, antes de enviar,
"este aviso é da categoria marketing e custa X" (ver [02-custos](02-custos.md)).
Avisos de manutenção/segurança seguem baratos; convite para festa junina, não.

> **Decisão pendente do usuário**: aceitar que aviso de tipo "evento" custe
> categoria marketing, ou tirar esse tipo do WhatsApp. Item 3 de
> [00-perguntas-abertas](00-perguntas-abertas.md).

### 3.2 Templates editáveis pelo condomínio

**Hoje**: `/whatsapp` tem um editor de texto livre; o síndico salva e o próximo
envio já usa o texto novo, sem intermediários. É uma feature vendida.

**Na Cloud API**: cada edição é uma submissão nova, com até 24 h de análise, e
pode ser **rejeitada**.

**Alternativas**:

| # | Alternativa | Prós | Contras |
|---|---|---|---|
| **A** | **Fluxo de aprovação no painel**: o editor continua, mas o texto salvo entra em `rascunho → em_analise → aprovado → ativo`. Até aprovar, envia-se a versão aprovada anterior | Mantém a feature; o síndico entende o porquê da espera | Estado novo na UI, polling do status do template, e-mail/aviso de rejeição |
| **B** | **Catálogo de variantes**: a plataforma pré-aprova N variantes por mensagem; o síndico escolhe uma | Zero espera, zero rejeição | Deixa de ser personalização de verdade |
| **C** | **Só o superadmin edita**, e a edição vale para todos | Um template por mensagem na plataforma inteira, barato de operar | Tira do síndico algo que ele já tem |

**Recomendação**: **A**, com **B como fallback visual** (oferecer 2–3 variantes
prontas no editor, para quem só quer "outro jeito de dizer"). O estado do
template já precisa existir no banco de qualquer forma (§6).

> **Atenção ao multiplicador**: na arquitetura de *uma WABA por condomínio*
> (opção C do doc 03), cada condomínio tem seus próprios templates — 200
> condomínios × 6 templates = 1.200 submissões para gerenciar. Numa WABA única,
> são 6. Este gap é um argumento forte na escolha da arquitetura.

### 3.3 Opt-in

**Hoje**: `receber_whatsapp` nasce `true`. No autocadastro, o DTO nem expõe o
campo — o comentário no código diz "o produto inteiro depende disso".

**Na Cloud API**: precisa de opt-in demonstrável (quando, por onde, com que
texto). Não há verificação automática da Meta, mas é o que se apresenta se o
número for denunciado — e denúncia é o que derruba quality rating.

**Alternativa**: manter o cadastro como está e **registrar o opt-in de forma
auditável**:

- Coluna `moradores.optin_at`, `optin_origem` (`autocadastro` | `importacao` |
  `cadastro_manual` | `whatsapp`), `optin_texto_versao`.
- Na página pública `/cadastro/:token`, um checkbox **não pré-marcado** com o
  texto de consentimento (e o texto versionado, para saber o que a pessoa aceitou).
- Para a base **já existente**: campanha de opt-in ativo. Como não dá para pedir
  consentimento por WhatsApp sem já mandar WhatsApp, o caminho é o template
  utility de encomenda (que o morador já espera) com um rodapé "para parar de
  receber, responda SAIR", **mais** a captura no autocadastro. Isso torna a base
  legada opt-out-registrado, que é o realista.
- Processar `SAIR`/`PARAR`/`STOP` no inbound → `receber_whatsapp = false`.
  **Hoje isso não existe**: o `handleInboundIntent` só entende "retirar/código".

> LGPD: o opt-in registrado é também a base legal documentada do tratamento.
> Ver item 6 de [00-perguntas-abertas](00-perguntas-abertas.md).

### 3.4 Verificação de número (`contacts/check`)

**Hoje**: antes de enviar, pergunta ao gateway se o número existe — testando
**com e sem o nono dígito** (`stripBrazilNinthDigit`), e cacheia o JID por 30
dias. Número inexistente vira falha **terminal**, sem gastar retentativa.

**Na Cloud API**: não existe endpoint de verificação. Envia-se em E.164; se não
existir, volta `131026` — **depois** de a mensagem ter sido aceita pela API.

**Alternativas**:

- Enviar em E.164 puro e tratar `131026` como terminal (mesma semântica de hoje,
  só que a descoberta é a posteriori).
- Guardar o `wa_id` que a Cloud API devolve no campo `contacts` da resposta de
  envio — é o equivalente do JID e resolve o nono dígito **na resposta**, não
  antes. Cachear igual hoje.
- **A confirmar**: o comportamento exato da Cloud API com o nono dígito
  brasileiro não está documentado de forma conclusiva. Precisa de teste empírico
  na Fase 1 com números reais de DDDs diferentes. Item 9 de
  [00-perguntas-abertas](00-perguntas-abertas.md).

### 3.5 O ritmo anti-bloqueio deixa de fazer sentido — mas o scheduler não

**Hoje**: 60 s + jitter entre mensagens, lote, cota diária, janela 08–21 h,
trava por condomínio. Tudo isso existe para **não ser banido**.

**Na Cloud API**: 80 msg/s por número. Espaçar 60 s é jogar fora capacidade —
um aviso para 300 unidades levaria 5 horas sem nenhuma razão.

Mas o `DispatchSchedulerService` **não deve ser deletado**. Ele muda de dono:

| Regra | Hoje | Depois |
|---|---|---|
| Intervalo 60 s + jitter | anti-banimento | **remove** (ou baixa para o mínimo do throughput) |
| Trava um-envio-por-condomínio | anti-banimento | **remove** — a Cloud API é concorrente |
| Cota diária por condomínio | anti-banimento | **vira controle de custo** (teto de gasto do condomínio) e de *messaging limit* |
| Janela 08:00–21:00 | anti-banimento | **fica**, como decisão de produto (não acordar morador às 3 h) |
| Repescagem `moveToDelayed` | contenção da trava | vira backoff de `130429` (throughput) |

O ganho é grande: hoje um condomínio com 300 avisos leva ~5 h; na Cloud API,
segundos. O que precisa segurar é o **messaging limit do tier** e o **custo**,
não a cadência.

### 3.6 Provisionamento por QR

**Hoje**: `/whatsapp` mostra um QR, o síndico lê com o celular do condomínio e
pronto. O número continua funcionando normalmente no aparelho.

**Na Cloud API**: registrar o número numa WABA **o remove do app WhatsApp /
WhatsApp Business**. Não dá para ter os dois. É irreversível na prática (dá para
migrar de volta, mas com downtime e perda do histórico do aparelho).

**Alternativa**: a decisão do número passa a ser comercial, não técnica —
está inteiramente coberta em [03-setup-conta-meta](03-setup-conta-meta.md).
Aqui basta registrar: **o onboarding de um condomínio muda de "leia este QR"
para "nos dê um número novo" ou "vamos usar o número da plataforma"**.

### 3.7 Resumo dos gaps

| Gap | Severidade | Alternativa escolhida |
|---|:---:|---|
| Aviso livre do síndico | 🔴 alta | Template por tipo de aviso (§3.1-A) |
| Template editável pelo condomínio | 🟠 média | Fluxo de aprovação no painel (§3.2-A) |
| Opt-in não registrado | 🔴 alta | Registro auditável + `SAIR` no inbound (§3.3) |
| `contacts/check` inexistente | 🟢 baixa | `wa_id` da resposta + `131026` terminal (§3.4) |
| Ritmo anti-bloqueio obsoleto | 🟢 baixa | Scheduler vira controle de custo/limite (§3.5) |
| QR some do onboarding | 🟠 média | Decisão de arquitetura de números (doc 03) |

---

## 4. Arquitetura proposta

### 4.1 Princípio

Um **provider de mensageria** com duas implementações, escolhido **por
condomínio**, para que OpenWA e Cloud API coexistam durante todo o rollout —
e para que o rollback seja um `UPDATE` numa coluna, não um deploy.

```
                        ┌────────────────────────────────────┐
   encomendas ─┐        │  NotificationService (fila)        │
   avisos ─────┼──────► │  DispatchScheduler (custo/limite)  │
   vagas ──────┘        └───────────────┬────────────────────┘
                                        │
                        ┌───────────────▼────────────────────┐
                        │  NotificationDispatcher (worker)   │
                        └───────────────┬────────────────────┘
                                        │ resolve(tenantId)
                        ┌───────────────▼────────────────────┐
                        │  MessagingProviderResolver         │
                        │  lê tenants.messaging_provider     │
                        └───────┬───────────────────┬────────┘
                                │                   │
                  ┌─────────────▼──────┐   ┌────────▼─────────────┐
                  │ OpenWaProvider     │   │ CloudApiProvider     │
                  │ (envolve o service │   │ (Graph API)          │
                  │  atual, intacto)   │   │                      │
                  └────────────────────┘   └──────────────────────┘
                            │                        │
              POST /webhooks/openwa/:tenantId   POST /webhooks/whatsapp
                            └──────────┬─────────────┘
                                       ▼
                         WhatsappService (histórico + intenções)
```

### 4.2 A interface

```ts
// src/modules/messaging/messaging-provider.ts

/** O que o chamador quer mandar — sem saber por qual provedor sai. */
export interface OutboundMessage {
  tenantId: string;
  to: string;                      // E.164
  /** Identidade da mensagem no catálogo do sistema. */
  templateKey: MessageTemplateKey; // 'encomenda_chegou' | 'encomenda_retirada' | ...
  /** Valores nomeados; cada provider decide como usar. */
  variables: Record<string, string>;
  /** Texto já renderizado — o OpenWA manda isto; a Cloud API usa só na janela. */
  renderedText: string;
  idempotencyKey: string;
}

export interface SendResult {
  providerMessageId: string;
  /** wa_id devolvido pela Cloud API (equivalente do JID). Null no OpenWA. */
  resolvedWaId?: string | null;
  /** Se a mensagem é cobrada, e como. Alimenta o relatório de custo. */
  billing?: { category: 'utility' | 'marketing' | 'authentication' | 'service' | 'free' };
}

export interface MessagingProvider {
  readonly name: 'openwa' | 'cloud_api';

  /** O que este provedor consegue fazer — o chamador NÃO faz if (name === ...). */
  readonly capabilities: {
    /** Manda texto livre fora da janela de 24 h? OpenWA sim, Cloud API não. */
    freeFormOutsideWindow: boolean;
    /** Precisa de template aprovado? */
    requiresApprovedTemplate: boolean;
    /** Devolve status de entrega (delivered/read)? */
    deliveryReceipts: boolean;
    /** Espaçamento mínimo recomendado entre mensagens (ms). */
    minIntervalMs: number;
  };

  send(msg: OutboundMessage): Promise<SendResult>;
  /** Estado da conexão para a tela — polimórfico (QR × status da WABA). */
  connectionInfo(tenantId: string): Promise<ConnectionInfo>;
}
```

**Duas decisões de projeto que valem o comentário:**

1. **`capabilities`, e não `if (provider === 'cloud_api')`.** O dispatcher
   pergunta `capabilities.freeFormOutsideWindow` para decidir se renderiza texto
   ou monta componentes de template. Sem isso, o `if` se espalha e cada rota nova
   esquece de um lado — exatamente o que o `TenantScopeGuard` evita no multitenant.

2. **`renderedText` continua existindo.** O `notificacoes.conteudo` já guarda o
   texto renderizado, e é ele que a tela "Filas" mostra ao síndico. A Cloud API
   manda variáveis, mas o texto renderizado continua sendo gravado — para o
   histórico e para o síndico ver o que saiu.

### 4.3 Feature flag por tenant

```sql
ALTER TABLE tenants
  ADD COLUMN messaging_provider varchar(20) NOT NULL DEFAULT 'openwa';
-- CHECK (messaging_provider IN ('openwa','cloud_api'))
```

- **Padrão `openwa`**: nenhum condomínio muda de comportamento no deploy.
- Trocar é um `PATCH /admin/tenants/:id` do superadmin (nunca do síndico).
- **Rollback** = voltar a coluna. Como a sessão OpenWA **não é destruída** ao
  migrar (só deixa de ser usada), o caminho de volta é imediato — desde que o
  número não tenha sido portado para a Cloud API. Ver §9.5.

### 4.4 Onde o código muda

| Camada | Mudança |
|---|---|
| `src/modules/messaging/` (**novo**) | Interface, resolver, `OpenWaProvider`, `CloudApiProvider`, cliente Graph API |
| `src/modules/openwa/` | `OpenwaService` perde o `sendText` público (vira detalhe do provider) e **cede a config de template/ritmo** para o módulo novo `messaging` |
| `notification-dispatcher.service.ts` | `openwa.sendText(...)` → `provider.send(...)`; mapa de erros novo |
| `whatsapp.service.ts` | `sendTemplated` passa pelo provider; `PROVIDER` deixa de ser constante |
| `whatsapp/webhook-cloud-api.controller.ts` (**novo**) | `GET` (verificação) + `POST` (eventos), com validação de assinatura |
| `whatsapp/inbound-cloud-api.parser.ts` (**novo**) | Tradução do payload da Meta |
| `src/modules/templates/` (**novo**) | Catálogo de templates, submissão, status, sincronização com a Meta |
| `main.ts` | `NestFactory.create(AppModule, { rawBody: true })` — a assinatura do webhook é sobre o corpo **cru** |
| `web/src/components/Whatsapp*` | Card de conexão polimórfico; card de modelos com estado de aprovação |

> **Compatível com o CLAUDE.md do projeto**: o módulo `messaging` nasce com o
> próprio `CLAUDE.md` (regra 33), as rotas novas declaram `@Roles(...)` e a
> tabela "O que cada perfil faz" do `CLAUDE.md` raiz é atualizada (regra 32).

---

## 5. Mapeamento: mensagem atual → template da Meta

Convenções: nome em `snake_case` minúsculo (exigência da Meta), idioma `pt_BR`,
variáveis **posicionais** (`{{1}}`…) — a Cloud API não tem variável nomeada em
template padrão.

> **Enquadramento de categoria**: a diretriz da Meta define *utility* como
> mensagem **não-promocional** que seja **específica do usuário** (relacionada a
> um pedido/conta dele) **ou** essencial/crítica. "Sua encomenda chegou na
> portaria" é o exemplo canônico de atualização de pedido → **utility**.

### 5.1 `encomenda_chegou` — utility

**Texto de hoje** (`DEFAULT_TEMPLATE_ENCOMENDA`, 9 variáveis nomeadas):

```
Olá, {{nome}}! 📦

Chegou uma encomenda para a unidade *{{unidade}}* na portaria do {{condominio}}.

📅 Recebida em {{data}} às {{hora}}
📦 Tipo: {{tipo}}
🚚 Transportadora: {{transportadora}}

🔑 Código de retirada: *{{codigo}}*
Apresente este código na portaria para retirar. 🙂
```

**Payload de submissão** (`POST /{waba-id}/message_templates`):

```json
{
  "name": "encomenda_chegou",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    {
      "type": "BODY",
      "text": "Olá, {{1}}! 📦\n\nChegou uma encomenda para a unidade *{{2}}* na portaria do {{3}}.\n\n📅 Recebida em {{4}} às {{5}}\n📦 Tipo: {{6}}\n🚚 Transportadora: {{7}}\n\n🔑 Código de retirada: *{{8}}*\nApresente este código na portaria para retirar. 🙂",
      "example": {
        "body_text": [["João", "A-101", "Residencial Aurora", "24/07/2026", "14:35", "caixa", "Correios", "4827"]]
      }
    },
    { "type": "FOOTER", "text": "Para parar de receber, responda SAIR." }
  ]
}
```

| Posição | Variável de hoje | Origem |
|---|---|---|
| `{{1}}` | `nome` | primeiro nome do morador |
| `{{2}}` | `unidade` | `apartamento.identificador` |
| `{{3}}` | `condominio` | `tenant.nome` |
| `{{4}}` | `data` | `encomenda.created_at` (fuso local) |
| `{{5}}` | `hora` | idem |
| `{{6}}` | `tipo` | `encomenda.tipo` |
| `{{7}}` | `transportadora` | `encomenda.transportadora` ou "não informada" |
| `{{8}}` | `codigo` | `encomenda.codigo_retirada` |

> `{{morador}}` (nome completo) fica de fora: hoje só existe como *alias*
> disponível ao síndico, não no texto padrão. Se algum condomínio o usa no
> template personalizado, ele entra como variável 9 na versão daquele
> condomínio. O `TOKEN_ALIASES` de `message-template.ts` continua servindo para
> traduzir o texto do síndico → posições.

> **Rodapé de opt-out**: acrescentado de propósito (§3.3). Custa nada e é o que
> segura o quality rating.

### 5.2 `encomenda_retirada` — utility

Mesmo enquadramento (atualização de um pedido específico do usuário).

```json
{
  "name": "encomenda_retirada",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [{
    "type": "BODY",
    "text": "Olá, {{1}}! ✅\n\nConfirmamos a retirada da encomenda da unidade *{{2}}* na portaria do {{3}}.\n\n📅 Retirada em {{4}} às {{5}}\n\nObrigado! 🙂",
    "example": { "body_text": [["João", "A-101", "Residencial Aurora", "27/07/2026", "18:02"]] }
  }]
}
```

`{{1}}` nome · `{{2}}` unidade · `{{3}}` condomínio · `{{4}}` data da retirada ·
`{{5}}` hora da retirada. Sem `{{codigo}}`, como hoje.

> **Candidata a corte de custo**: é a mensagem menos essencial das cinco. Se o
> morador retirou, ele sabe que retirou. Ver [02-custos](02-custos.md),
> otimizações.

### 5.3 Avisos — **um template por tipo** (§3.1-A)

O campo `avisos.tipo` já existe com cinco valores. Proposta:

| `tipo` | Template | Categoria pretendida | Confiança |
|---|---|---|---|
| `urgente` | `aviso_urgente` | UTILITY (essencial/crítico) | 🟡 média |
| `manutencao` | `aviso_manutencao` | UTILITY (essencial/crítico) | 🟡 média |
| `financeiro` | `aviso_financeiro` | UTILITY (específico da conta) | 🟡 média |
| `geral` | `aviso_geral` | **MARKETING** (conteúdo genérico) | 🔴 alta que seja marketing |
| `evento` | `aviso_evento` | **MARKETING** | 🔴 alta |

Exemplo (`aviso_manutencao`):

```json
{
  "name": "aviso_manutencao",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "🔧 Manutenção — {{1}}",
      "example": { "header_text": ["Residencial Aurora"] } },
    { "type": "BODY",
      "text": "Olá, {{1}}!\n\n{{2}}\n\nQualquer dúvida, procure a administração.",
      "example": { "body_text": [["João", "A manutenção do elevador social acontece na quinta-feira, 07/08, das 8h às 12h."]] } },
    { "type": "FOOTER", "text": "Para parar de receber, responda SAIR." }
  ]
}
```

**Riscos que precisam de teste real, não de opinião:**

- `{{2}}` carrega o corpo inteiro. A moldura fixa (header + saudação + rodapé) é
  o que evita "template que é só variável", mas **só a submissão real diz** se a
  Meta aprova como utility. Testar na Fase 1 com os cinco.
- A Meta **recategoriza templates aprovados mensalmente**. Um `aviso_manutencao`
  aprovado como utility pode virar marketing depois. O sistema precisa **ler a
  categoria vigente da API** e usá-la no cálculo de custo, nunca a categoria
  submetida. Isso é uma exigência de arquitetura, não um detalhe (§6).

### 5.4 `cobranca_vaga` — utility

O texto de hoje (`montarMensagemCobranca`) é **condicional**: acrescenta blocos
de Pix e/ou boleto conforme existam. Template não tem `if`.

**Alternativa**: três templates, escolhidos no envio —
`cobranca_vaga_pix`, `cobranca_vaga_boleto`, `cobranca_vaga_sem_pagamento`.
Alternativa mais enxuta: **um** template com a linha de pagamento como variável
(`{{7}}` = "🔑 Pix copia e cola: 000201..." ou "Procure a administração..."),
com o custo de a variável ficar longa.

Recomendação: **três templates** — a variável-parágrafo é o padrão que a Meta
recategoriza como marketing.

```json
{
  "name": "cobranca_vaga_pix",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [{
    "type": "BODY",
    "text": "Olá, {{1}}! 🚗\n\nSegue a cobrança da vaga *{{2}}* no {{3}}.\n\n📅 Referência: {{4}}\n💰 Valor: *{{5}}*\n⏰ Vencimento: *{{6}}*\n\n🔑 Pix copia e cola:\n{{7}}\n\nQualquer dúvida, é só falar com a administração. 🙂",
    "example": { "body_text": [["João","12","Residencial Aurora","agosto de 2026","R$ 250,00","05/08/2026","00020126580014BR.GOV.BCB.PIX..."]] }
  }]
}
```

> ⚠️ **Pix copia-e-cola tem ~150–300 caracteres.** Confirmar o limite de
> caracteres do corpo hidratado — estourar dá `132005`. Item 10 de
> [00-perguntas-abertas](00-perguntas-abertas.md).

### 5.5 `cobranca_condominio` — utility

Texto de hoje, inline em `apartamentos.service.ts`:
`Olá {nome}, o valor do condomínio (R$ {valor}) vence em breve.`

```json
{
  "name": "cobranca_condominio",
  "language": "pt_BR",
  "category": "UTILITY",
  "components": [{
    "type": "BODY",
    "text": "Olá, {{1}}! O valor do condomínio ({{2}}) vence em breve.",
    "example": { "body_text": [["João", "R$ 850,00"]] }
  }]
}
```

> O texto atual é fraco (não diz a data, nem o condomínio). A migração é uma boa
> hora para melhorá-lo — mas isso é escopo de produto, não da migração.

### 5.6 Respostas ao morador — **não são template**

`lembrete_codigo` e `sem_encomenda_pendente` saem **dentro da janela de 24 h**
(o morador acabou de escrever). Na Cloud API são *free-form session messages*:

- **Não precisam de aprovação.**
- **Não são cobradas** — "todas as mensagens não-template dentro de uma janela de
  atendimento aberta são gratuitas".
- O texto pode continuar sendo montado em código, exatamente como hoje.

**É um ganho puro da migração**: hoje elas passam pelo mesmo número frágil; lá
são grátis, imediatas e sem risco.

⚠️ **Guarda necessária**: o dispatcher precisa checar se a janela está mesmo
aberta antes de mandar free-form. Se o webhook da mensagem do morador chegou
mas a resposta demorou > 24 h (fila travada, retry longo), o envio volta
`131047`. Regra: `whatsapp_messages` já tem o `created_at` da última mensagem
`in` do morador — basta comparar.

### 5.7 Resumo

| Template | Categoria | Variáveis | Quando |
|---|---|:---:|---|
| `encomenda_chegou` | UTILITY | 8 | fora da janela |
| `encomenda_retirada` | UTILITY | 5 | fora da janela |
| `aviso_urgente` / `aviso_manutencao` / `aviso_financeiro` | UTILITY (a confirmar) | 2 | fora da janela |
| `aviso_geral` / `aviso_evento` | MARKETING | 2 | fora da janela |
| `cobranca_vaga_{pix,boleto,sem_pagamento}` | UTILITY | 6–7 | fora da janela |
| `cobranca_condominio` | UTILITY | 2 | fora da janela |
| `lembrete_codigo` · `sem_encomenda_pendente` | — (session) | — | dentro da janela, **grátis** |

**11 templates** por WABA (ou por condomínio, dependendo da arquitetura do doc 03).

---

## 6. Mudanças no schema do banco

Todas via `node-pg-migrate`, SQL puro (regra 10 do `CLAUDE.md`).

### 6.1 `tenants` — identidade na Meta

```sql
ALTER TABLE tenants
  ADD COLUMN messaging_provider   varchar(20) NOT NULL DEFAULT 'openwa',
  ADD COLUMN waba_id              varchar(40),
  ADD COLUMN phone_number_id      varchar(40),
  ADD COLUMN whatsapp_display_name varchar(120),
  ADD COLUMN whatsapp_quality_rating varchar(20),   -- GREEN | YELLOW | RED
  ADD COLUMN whatsapp_messaging_tier varchar(20),   -- TIER_250 | TIER_1K | ...
  ADD COLUMN whatsapp_verified_name varchar(120);

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_messaging_provider
    CHECK (messaging_provider IN ('openwa','cloud_api'));

-- O phone_number_id é a CHAVE DE ROTEAMENTO do webhook: um webhook único para a
-- plataforma inteira, e é por ele que se descobre de qual condomínio é o evento.
CREATE UNIQUE INDEX uq_tenants_phone_number_id
  ON tenants (phone_number_id) WHERE phone_number_id IS NOT NULL;
```

> **Por que `phone_number_id` único e indexado**: a Meta manda **um** webhook por
> app, não um por condomínio. O roteamento é
> `entry[].changes[].value.metadata.phone_number_id → tenant`. Sem esse índice,
> todo evento recebido faz seq scan em `tenants`.

> **`NULL` não é ausência de número — é "usa o número da plataforma".** Na
> arquitetura recomendada em [03-setup-conta-meta](03-setup-conta-meta.md), o
> padrão é um número único da plataforma (modo A) e o condomínio fica com
> `phone_number_id NULL`, enviando pelo `WHATSAPP_PHONE_NUMBER_ID` do ambiente.
> Só o condomínio com **número dedicado** (modo B) preenche a coluna — e aí a
> unicidade parcial vale exatamente para eles. O roteamento do webhook fica:
>
> ```
> phone_number_id → achou tenant?  → é dele (modo B, exato)
>                 → não achou?     → é o número da plataforma (modo A):
>                                    resolve pelo telefone do morador, como hoje
> ```

> **Token**: `WHATSAPP_SYSTEM_USER_TOKEN` fica em variável de ambiente, **não no
> banco**, enquanto for um token só (arquiteturas A e B do doc 03). Na
> arquitetura C (Embedded Signup, um token por cliente), vira tabela própria
> **criptografada** — ver item 5 de [00-perguntas-abertas](00-perguntas-abertas.md).

### 6.2 `whatsapp_templates` — o catálogo (novo)

```sql
CREATE TABLE whatsapp_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = template da plataforma (vale para todo condomínio da WABA).
  -- Preenchido = versão personalizada de um condomínio.
  tenant_id         uuid REFERENCES tenants(id) ON DELETE CASCADE,
  template_key      varchar(60)  NOT NULL,   -- 'encomenda_chegou', ...
  meta_name         varchar(80)  NOT NULL,   -- nome na Meta (pode ter sufixo por tenant)
  meta_template_id  varchar(40),             -- id devolvido pela Meta
  language          varchar(10)  NOT NULL DEFAULT 'pt_BR',
  -- Categoria SUBMETIDA e categoria VIGENTE. Elas divergem: a Meta
  -- recategoriza templates aprovados mensalmente, e é a vigente que cobra.
  category_submitted varchar(20) NOT NULL,
  category_current   varchar(20),
  status            varchar(20)  NOT NULL DEFAULT 'rascunho',
    -- rascunho | em_analise | aprovado | rejeitado | pausado | desabilitado
  rejection_reason  text,
  quality_score     varchar(20),             -- GREEN | YELLOW | RED
  body_text         text         NOT NULL,   -- com {{1}}, {{2}}...
  variable_map      jsonb        NOT NULL DEFAULT '[]'::jsonb,
    -- ["nome","unidade","condominio",...] — posição → variável do sistema
  components_json   jsonb        NOT NULL DEFAULT '{}'::jsonb,  -- payload submetido
  submitted_at      timestamptz,
  approved_at       timestamptz,
  ativo             boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_whatsapp_templates_vigente
  ON whatsapp_templates (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         template_key, language)
  WHERE ativo;
```

**Três decisões que valem explicação:**

1. **`tenant_id` NULL = template da plataforma.** É a exceção deliberada à regra
   "toda tabela de dado de condomínio nasce com `tenant_id NOT NULL`" — pelo
   mesmo motivo de `etiqueta_amostras`: o template padrão é igual em todo
   condomínio. Precisa ser registrado no `CLAUDE.md` raiz.
2. **`category_submitted` × `category_current`.** Sem as duas, o relatório de
   custo mente: a Meta recategoriza sozinha e a cobrança segue a vigente.
3. **`variable_map`.** É o que traduz `{"nome": "João"}` (como o sistema pensa)
   para `[{"type":"text","text":"João"}]` na posição certa (como a Meta espera).
   Sem isso, trocar a ordem das variáveis num template quebra os envios em
   silêncio.

### 6.3 `notificacoes` — identidade do template e status

```sql
ALTER TABLE notificacoes
  ADD COLUMN template_key   varchar(60),
  ADD COLUMN provider       varchar(20),          -- por qual saiu, de fato
  ADD COLUMN provider_message_id varchar(120),
  ADD COLUMN delivery_status varchar(20),         -- sent|delivered|read|failed
  ADD COLUMN delivered_at   timestamptz,
  ADD COLUMN read_at        timestamptz,
  ADD COLUMN error_code     integer,              -- código numérico da Meta
  ADD COLUMN billing_category varchar(20);        -- utility|marketing|...|free

CREATE INDEX idx_notificacoes_provider_msg
  ON notificacoes (provider_message_id) WHERE provider_message_id IS NOT NULL;
```

`variaveis_json` **já existe** e já guarda o mapa de variáveis de cada envio —
foi construído para renderizar o texto e serve de graça para montar os
componentes do template. É a peça que faz esta migração ser menor do que parece.

### 6.4 `moradores` — opt-in

```sql
ALTER TABLE moradores
  ADD COLUMN optin_at         timestamptz,
  ADD COLUMN optin_origem     varchar(30),   -- autocadastro|importacao|cadastro_manual|whatsapp
  ADD COLUMN optin_texto_versao varchar(20),
  ADD COLUMN optout_at        timestamptz,
  ADD COLUMN optout_origem    varchar(30);   -- painel|whatsapp

-- Base legada: registra o que é verdade hoje, sem inventar consentimento.
UPDATE moradores
   SET optin_at = created_at, optin_origem = 'legado', optin_texto_versao = 'v0'
 WHERE receber_whatsapp = true;
```

> `receber_whatsapp` **continua sendo a fonte da verdade do envio** — as colunas
> novas são a prova documental. Um `optout_at` preenchido sempre implica
> `receber_whatsapp = false`; a recíproca não vale (desmarcar no painel também é
> opt-out, e aí a origem é `painel`).

### 6.5 `whatsapp_messages` — dedup e status

```sql
ALTER TABLE whatsapp_messages
  ADD COLUMN phone_number_id varchar(40),
  ADD COLUMN wa_id           varchar(30),      -- identificador do usuário na Meta
  ADD COLUMN conversation_id varchar(80),      -- janela a que pertence
  ADD COLUMN error_code      integer,
  ADD COLUMN status_rank     smallint NOT NULL DEFAULT 0;

-- Idempotência de verdade: hoje é um SELECT antes do INSERT (janela de corrida).
CREATE UNIQUE INDEX uq_whatsapp_messages_provider_msg
  ON whatsapp_messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
```

`status_rank` existe porque **os webhooks de status chegam fora de ordem**:
`read` pode chegar antes de `delivered`. Ranking `queued(0) < sent(1) <
delivered(2) < read(3)`, `failed(9)` — só sobe, nunca desce.

### 6.6 `whatsapp_webhook_eventos` — dedup do webhook (novo)

Mesmo padrão já usado em `assinatura_webhook_eventos` (módulo Assinaturas):

```sql
CREATE TABLE whatsapp_webhook_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id    varchar(120) NOT NULL UNIQUE,  -- id da mensagem/status + tipo
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  payload_json jsonb NOT NULL,
  processado_at timestamptz,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

O `UNIQUE` em `evento_id` é o que torna o reprocessamento seguro (§7.4).

---

## 7. Webhooks

### 7.1 Verificação e assinatura

**Verificação (uma vez, no cadastro do webhook)** — a Meta faz um `GET`:

```
GET /api/webhooks/whatsapp?hub.mode=subscribe
                          &hub.challenge=1158201444
                          &hub.verify_token=<WHATSAPP_WEBHOOK_VERIFY_TOKEN>
```

Responder `200` com o `hub.challenge` **cru** (text/plain) se o token bater;
`403` se não.

**Assinatura (todo `POST`)**: header `X-Hub-Signature-256: sha256=<hmac>`, HMAC
SHA-256 do **corpo cru** com o *app secret*.

```ts
// ⚠️ Precisa do corpo CRU. NestFactory.create(AppModule, { rawBody: true })
// e @Req() req: RawBodyRequest<Request>. Se validar sobre o JSON já parseado,
// a assinatura NUNCA vai bater — a serialização não é byte-a-byte idêntica.
const esperado = 'sha256=' + createHmac('sha256', appSecret)
  .update(req.rawBody).digest('hex');
if (!timingSafeEqual(Buffer.from(esperado), Buffer.from(assinaturaRecebida))) {
  throw new UnauthorizedException();
}
```

> `timingSafeEqual`, não `===`. Comparação de string vaza o prefixo correto por
> tempo. (O webhook de pagamentos do projeto já resolve isso — vale conferir e
> reaproveitar a peça em `src/modules/assinaturas/webhook-pagamentos.controller.ts`.)

### 7.2 Roteamento para o condomínio — **melhor que hoje**

```json
{
  "entry": [{
    "id": "<WABA_ID>",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "5532999999999",
                      "phone_number_id": "106540352242922" },
        "statuses": [ /* ... */ ],
        "messages":  [ /* ... */ ]
      }
    }]
  }]
}
```

O condomínio sai de `metadata.phone_number_id` → `tenants.phone_number_id`
(índice único do §6.1). **Isso elimina a ambiguidade de hoje**: o mesmo telefone
cadastrado em dois condomínios deixa de ser um problema de desempate, porque o
*destino* é identificado com precisão pela própria Meta.

> Exceção: na **arquitetura A** (um número só para toda a plataforma, doc 03), o
> `phone_number_id` é o mesmo para todos e a ambiguidade **volta pior** — sem nem
> o desempate por número de destino. É o argumento técnico decisivo contra a A.

### 7.3 Eventos a consumir

| Campo | Evento | O que fazer |
|---|---|---|
| `messages` | mensagem recebida | `recordInbound` + `handleInboundIntent` (como hoje) + **abrir a janela de 24 h** + processar `SAIR` |
| `statuses[].status = sent` | aceita pela Meta | `delivery_status = 'sent'` |
| `statuses[].status = delivered` | entregue no aparelho | `delivered_at`; é aqui que a **cobrança acontece** |
| `statuses[].status = read` | lida | `read_at` (métrica de qualidade do template) |
| `statuses[].status = failed` | falhou | `error_code` + decidir retry (§8) |
| `message_template_status_update` | template aprovado/rejeitado/pausado | atualiza `whatsapp_templates.status` — **é o que fecha o fluxo de aprovação do §3.2** |
| `template_category_update` | recategorização | atualiza `category_current` (§6.2) |
| `phone_number_quality_update` | quality rating mudou | `tenants.whatsapp_quality_rating` + alerta ao superadmin |
| `account_update` | WABA restrita/banida | alerta **imediato** + considerar fallback |

> Os quatro últimos são o painel de saúde que **hoje não existe**. É o principal
> ganho operacional da migração, além da estabilidade.

### 7.4 Idempotência e reprocessamento

Três camadas, na ordem:

1. **`whatsapp_webhook_eventos.evento_id` UNIQUE** — `INSERT ... ON CONFLICT DO
   NOTHING`. Conflito = já vimos, responde `200` e para.
2. **`uq_whatsapp_messages(provider, provider_message_id)`** — protege o
   histórico mesmo se a camada 1 falhar.
3. **`status_rank` monotônico** — status fora de ordem não regride.

**Responder `200` sempre e rápido.** A Meta reentrega em caso de erro ou timeout,
e reentrega vira resposta duplicada ao morador — o mesmo problema que o código
de hoje já contorna soltando o `handleInboundIntent`. Padrão: gravar o evento
cru, responder `200`, processar assíncrono (fila BullMQ nova,
`whatsapp-webhook`).

**Reprocessamento**: `processado_at IS NULL AND created_at < now() - '10 min'`
→ reenfileira. Um comando administrativo, não um cron agressivo.

---

## 8. Tratamento de erros e rate limiting

### 8.1 Códigos mais comuns e o que fazer

Códigos e descrições da [referência oficial](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/)
(consultada em 04/08/2026).

| Código | O que é | Retry? | Ação no Chegou |
|---|---|:---:|---|
| `131047` | Janela de 24 h fechada | ❌ | **Bug nosso**: mandamos free-form fora da janela. Refazer como template e logar como erro de código |
| `131026` | Destinatário não é usuário do WhatsApp / não aceitou os termos | ❌ | Terminal. Mesma semântica do `WhatsappNumberNotFoundError` de hoje. Marcar o morador para revisão do síndico |
| `130403` | O negócio bloqueou o usuário | ❌ | Terminal; alertar o síndico |
| `131050` | Usuário optou por não receber marketing | ❌ | Terminal + **`receber_whatsapp = false`**. Assinar o webhook `user_preferences` |
| `131049` | Não entregue para manter engajamento saudável (limite de marketing) | ⏳ | Reagendar > 24 h. Sinal de que o volume de marketing está alto |
| `130429` | Throughput da Cloud API estourado | ✅ | Backoff exponencial. Já existe o `moveToDelayed` + `DelayedError` — reaproveitar |
| `80007` | Rate limit da WABA | ✅ | Backoff mais longo (minutos) |
| `4` | Rate limit do app | ✅ | Backoff; se persistir, reduzir `NOTIFICATION_CONCURRENCY` |
| `131056` | Muitas mensagens ao mesmo destinatário rápido demais (1 msg / 6 s por par) | ✅ | Espaçar **por destinatário** — regra nova, o scheduler de hoje espaça por condomínio |
| `132000` | Nº de parâmetros diferente do template | ❌ | **Bug nosso** — `variable_map` desalinhado. Alerta alto |
| `132001` | Template não existe / idioma indisponível | ❌ | Bug de configuração. Cair para o provider antigo? Não: alertar e falhar |
| `132015` | Template pausado por qualidade | ❌ | Marcar `status='pausado'`, **parar de usar**, alertar superadmin |
| `132016` | Template desabilitado de vez | ❌ | Idem, sem volta: criar template novo |
| `132007` | Conteúdo viola política | ❌ | Submissão rejeitada; mostrar o motivo ao síndico (§3.2) |
| `131064` | Limite atingido por violações de template | ⏳ | Volta sozinho; alertar |
| `368` / `131031` | Conta restrita / bloqueada por política | ❌ | **Incidente**: alerta imediato ao superadmin, avaliar fallback para OpenWA |
| `190` | Token expirado | ❌ | Alerta crítico. Token de System User **não expira**, então isto é sinal de revogação |
| `133016` | Excesso de tentativas de registro do número | ⏳ | Esperar; ocorre no onboarding |

### 8.2 Política de retry

```
Retriável   (130429, 80007, 4, 131056, 5xx, timeout de rede)
  → backoff exponencial com jitter: 5s → 20s → 90s → 6min → 30min
  → 5 tentativas (hoje são 3 — a Cloud API tem mais erros transitórios legítimos)
  → esgotou → DLQ

Terminal    (131026, 130403, 131050, 132000, 132001, 132015, 132016, 132007)
  → status FALHA imediato, sem gastar tentativa, com error_code gravado

Incidente   (368, 131031, 190)
  → PAUSA a fila do tenant (ou da plataforma, se for token/WABA)
  → alerta ao superadmin
  → NÃO tenta de novo em loop: insistir com conta restrita piora
```

> A separação retriável/terminal **já existe** no dispatcher de hoje
> (`WhatsappNumberNotFoundError` é terminal). O que muda é que a lista cresce e
> passa a ser dirigida por **código numérico**, não por tipo de exceção. Vale
> extrair para um `cloud-api-errors.ts` com uma função
> `classificar(code): 'retriavel' | 'terminal' | 'incidente'` e teste unitário —
> é o tipo de tabela que fica errada em silêncio.

### 8.3 Dead-letter queue

Hoje **não existe DLQ**: notificação que estoura as tentativas vira
`status = 'falha'` com `erro_mensagem`, e só. Aparece na tela "Filas".

Proposta mínima (e suficiente):

- Fila BullMQ `notification-dlq`, com o job e o último erro.
- `notificacoes.status = 'falha'` continua sendo a verdade para a tela — a DLQ é
  para operação, não para o síndico.
- Uma tela do superadmin com "falhas por código nas últimas 24 h" — é isso que
  transforma `132000` de mistério em bug rastreável.
- O `POST /notificacoes/:id/reenviar` que já existe continua funcionando: ele
  recria o agendamento passando pelo scheduler, o que é o comportamento certo.

### 8.4 Rate limiting do nosso lado

| Limite da Meta | Valor | Onde controlar |
|---|---|---|
| Throughput por número | 80 msg/s (padrão) | Limiter na fila, por `phone_number_id` |
| Par negócio↔usuário | 1 msg / 6 s | **Novo**: chave Redis `wa:par:{phone_number_id}:{wa_id}` |
| Messaging limit (tier) | 250 / 2.000 / 10.000 / 100.000 / ∞ destinatários únicos por 24 h móveis | **Novo**: `HyperLogLog`/set com TTL de 24 h por número, contando **destinatários únicos**, não mensagens |
| API calls | 200/h (conta inativa) · 5.000/h (ativa) | Só afeta gestão de templates/números, não envio |

> A **cota diária de hoje conta mensagens**; o messaging limit conta
> **destinatários únicos em 24 h móveis**. São coisas diferentes: 3 encomendas
> para o mesmo morador = 3 mensagens, 1 destinatário. O `DispatchScheduler`
> precisa de um contador novo, não de um ajuste no atual. É a mudança mais sutil
> de toda a migração e a mais fácil de errar.

---

## 9. Rollout em fases

Sete fases. Cada uma tem **critério de entrada**, **critério de saída** e um
gatilho de rollback. Nenhuma fase começa sem a anterior fechada.

### Fase 0 — Contas e verificação *(sem código)*

- **Entrada**: decisão de arquitetura tomada (doc 03).
- **Faz**: Business Manager, verificação de negócio, WABA, número de teste,
  System User, token, webhook em ambiente de homologação.
- **Saída**: uma mensagem de teste entregue num celular real pela Cloud API,
  fora do Chegou (curl puro).
- **Rollback**: não se aplica.

### Fase 1 — Templates submetidos e aprovados *(sem código de produção)*

- **Entrada**: Fase 0 fechada.
- **Faz**: submeter os 11 templates do §5. Descobrir **empiricamente** o que a
  Meta aprova como utility (especialmente os cinco de aviso, §5.3).
- **Saída**: ≥ 90 % dos templates aprovados; **categorias reais anotadas** —
  elas alimentam o [02-custos](02-custos.md), que hoje está estimando.
- **Rollback**: n/a. Se `aviso_manutencao` cair como marketing, a decisão do
  §3.1 é revisitada aqui, **antes** de escrever código.

> Esta fase é barata e responde a maior incerteza do projeto. Não pule.

### Fase 2 — Camada de abstração, sem nenhum tenant migrado

- **Entrada**: Fase 1 fechada.
- **Faz**: módulo `messaging`, `MessagingProvider`, `OpenWaProvider` envolvendo o
  service atual, resolver, coluna `messaging_provider` (default `openwa`),
  migrations do §6.
- **Saída**: **nenhuma mudança de comportamento em produção** — todos os
  condomínios continuam em `openwa`, os testes e2e passam, `npm run test:e2e`
  verde (regra 29 do `CLAUDE.md`).
- **Rollback**: deploy anterior. É uma refatoração sem mudança funcional; se
  algo quebrar, quebrou aqui e é visível na hora.

### Fase 3 — `CloudApiProvider` + condomínio-cobaia interno

- **Entrada**: Fase 2 em produção há ≥ 1 semana sem incidente.
- **Faz**: implementa o provider, o webhook, o parser, a classificação de erros.
  Um condomínio **de teste, criado para isso**, com moradores que são a equipe.
- **Saída**: os 6 fluxos exercitados de ponta a ponta (chegada, retirada, aviso
  de cada tipo, cobrança de vaga, cobrança de condomínio, resposta ao morador),
  com status `delivered` chegando por webhook e aparecendo na tela "Filas".
- **Rollback**: `UPDATE tenants SET messaging_provider='openwa'` no cobaia.

### Fase 4 — Piloto: 1 condomínio real, pequeno

- **Entrada**: Fase 3 fechada, e o síndico do piloto **avisado e de acordo** —
  ele vai perder o WhatsApp no aparelho (§3.6).
- **Critérios de escolha do piloto**: < 60 unidades (cabe no tier 250 desde o
  primeiro dia), síndico acessível, sem uso pesado de avisos.
- **Saída**, medida em 14 dias:
  - taxa de entrega (`delivered`/enviadas) ≥ a do OpenWA no mesmo período;
  - quality rating **GREEN**;
  - zero `132015` (template pausado);
  - nenhuma reclamação de morador que não recebeu;
  - custo real do período dentro de ±20 % da projeção do doc 02.
- **Rollback**: flag de volta para `openwa`. ⚠️ **Só é reversível de graça se o
  número do condomínio não tiver sido portado.** Ver §9.5.

### Fase 5 — Onda 1: 10–20 % da base

- **Entrada**: Fase 4 com os cinco critérios verdes.
- **Faz**: migra por lote, priorizando condomínios **pequenos e médios**
  (o tier 250 é o gargalo) e os que **já tiveram número bloqueado** — são os que
  mais ganham.
- **Saída**: mesmos critérios da Fase 4, agregados; e o tier de cada número
  subindo (250 → 2.000) dentro de 30 dias.
- **Rollback**: por condomínio, individualmente. Nunca em massa: se o problema
  for da plataforma, ele aparece no primeiro.

### Fase 6 — Onda 2: o resto, exceto os grandes

- **Entrada**: Onda 1 estável por 30 dias.
- **Faz**: o grosso da base.
- **Saída**: ≥ 90 % dos condomínios em `cloud_api`.

### Fase 7 — Grandes e desligamento do OpenWA

- **Entrada**: Onda 2 estável; os números grandes já em tier ≥ 10.000.
- **Faz**: migra os condomínios grandes (aviso geral para 300+ unidades exige
  tier alto — migrar antes de o tier subir é receita para `131049`/`130429`);
  depois desliga o gateway OpenWA.
- **Saída**: `OPENWA_BASE_URL` vazio; container do gateway desligado; economia de
  infra realizada.
- **Rollback**: a partir daqui, deixa de existir. **Manter o `OpenWaProvider` no
  código por mais um trimestre** mesmo com o gateway desligado — apagar código é
  fácil, ressuscitá-lo sob pressão não.

### 9.5 A janela de rollback fecha — e é preciso saber quando

| Situação | Rollback é… |
|---|---|
| Condomínio usa **número novo** na Cloud API, o antigo segue no OpenWA | 🟢 imediato, sem perda — só volta a flag |
| Condomínio **portou** o número existente para a Cloud API | 🔴 caro: precisa desregistrar da WABA e reparear no OpenWA, com downtime de horas e perda do histórico do aparelho |
| Templates já em produção | 🟢 irrelevante — o OpenWA ignora templates |
| Opt-in registrado | 🟢 irrelevante — é dado, fica |

> **Recomendação forte**: nas fases 4 e 5, usar **número novo** por condomínio,
> não portar. Custa um chip a mais e compra a reversibilidade da fase inteira.
> Portar só na Fase 6/7, com o processo já rodado.

---

## 10. Estratégia de testes

### 10.1 Ambiente de teste da Meta

- Toda WABA nova ganha um **número de teste** gratuito, com cota de mensagens
  para até **5 números de destino** cadastrados. Serve para o desenvolvimento e
  não consome verba.
- Templates submetidos no número de teste **valem para a WABA** — dá para validar
  aprovação de categoria (Fase 1) antes de qualquer custo.
- **A confirmar**: cota exata e limite de destinatários do número de teste no
  modelo atual. Item 11 de [00-perguntas-abertas](00-perguntas-abertas.md).

### 10.2 Testes automatizados

| Nível | O que cobre | Onde |
|---|---|---|
| Unitário | `classificar(errorCode)` → retriável/terminal/incidente | `cloud-api-errors.spec.ts` (**novo**) |
| Unitário | `variable_map`: `{nome, unidade}` → `[{type:'text',text:'João'},...]` na ordem certa | `template-binding.spec.ts` (**novo**) |
| Unitário | Assinatura `X-Hub-Signature-256`: válida, inválida, corpo alterado | `webhook-signature.spec.ts` (**novo**) |
| Unitário | `status_rank`: `read` antes de `delivered` não regride | `whatsapp-status.spec.ts` (**novo**) |
| Unitário | Scheduler: contagem de **destinatários únicos** em 24 h móveis | estende `dispatch-scheduler.service.spec.ts` |
| e2e | Isolamento: webhook do `phone_number_id` de A **não** grava nada em B | estende `test/multitenant.e2e-spec.ts` |
| e2e | Fluxo de encomenda com provider mockado nos dois modos | estende `test/encomendas.e2e-spec.ts` |
| Contrato | Payload real da Meta gravado como fixture → parser | `inbound-cloud-api.parser.spec.ts` (**novo**) |

> `npm run test:e2e` é obrigatório em qualquer mexida em guard, papel, rota ou
> escopo (regra 29). A migração mexe em rota e em escopo.

### 10.3 Checklist de validação por condomínio

Rodar antes de virar a flag de cada condomínio, e de novo 24 h depois:

```
PRÉ-MIGRAÇÃO
[ ] Número definido e confirmado com o síndico (novo × portado)
[ ] Síndico ciente de que o número sai do app WhatsApp
[ ] display name aprovado
[ ] phone_number_id e waba_id gravados no tenant
[ ] webhook assinado e respondendo 200 ao GET de verificação
[ ] os 11 templates aprovados e visíveis para esta WABA
[ ] moradores com opt-in registrado ≥ 95 % da base ativa
[ ] messaging tier ≥ nº de unidades do condomínio (senão, aviso geral não cabe)

VIRADA
[ ] messaging_provider = 'cloud_api'
[ ] encomenda de teste registrada na portaria → chegou no celular
[ ] morador responde "código" → resposta automática chega (grátis, session)
[ ] status delivered aparece na tela Filas
[ ] aviso de teste para 1 unidade → chegou

24 H DEPOIS
[ ] quality rating GREEN
[ ] zero erro 132015 / 131049 / 368
[ ] taxa de entrega ≥ 95 %
[ ] custo do dia dentro do previsto
[ ] nenhuma mensagem presa em 'agendada' além da janela
```

---

## 11. Estimativa de esforço

**Estimativa**, não orçamento. Base: 1 pessoa desenvolvedora sênior conhecendo o
projeto, em dias úteis. Não inclui espera de aprovação da Meta (que é
calendário, não trabalho).

| Fase | Escopo | Esforço | Calendário |
|---|---|---:|---|
| 0 | Contas, verificação de negócio, WABA, System User, webhook de homologação | **2–3 d** | ⚠️ + **3 a 15 dias** de verificação de negócio na Meta |
| 1 | Submeter e iterar os 11 templates | **2–4 d** | + até 24 h por rodada de análise |
| 2 | Módulo `messaging`, interface, `OpenWaProvider`, resolver, 6 migrations | **6–9 d** | — |
| 3 | `CloudApiProvider`, cliente Graph, webhook + assinatura + fila, parser, classificação de erros, contador de destinatários únicos | **10–15 d** | — |
| — | Gap §3.1 — avisos por tipo (back + tela) | **3–5 d** | — |
| — | Gap §3.2 — fluxo de aprovação de template (back + tela + webhook de status) | **5–8 d** | — |
| — | Gap §3.3 — opt-in (migration, autocadastro, `SAIR` no inbound, tela) | **3–4 d** | — |
| — | Painel de saúde (quality, tier, falhas por código) | **3–5 d** | — |
| 4 | Piloto: acompanhamento, ajuste, correções | **3–5 d** | + 14 d de observação |
| 5–6 | Ondas: automação da migração em lote, suporte | **4–6 d** | + 30–60 d de calendário |
| 7 | Grandes + desligar OpenWA + limpeza | **2–3 d** | — |
| | **Total de desenvolvimento** | **43–67 d** | |
| | **Calendário realista** | | **4 a 6 meses**, dominado pelas ondas |

**O que pode estourar a estimativa**, em ordem de probabilidade:

1. **Categoria dos avisos** (§5.3). Se os cinco caírem como marketing, o §3.1
   precisa ser redesenhado — e isso é decisão de produto, não de código.
2. **Onboarding de número por condomínio** (doc 03). Se cada condomínio precisar
   de chip novo + verificação, o gargalo vira operacional e não cabe em
   estimativa de desenvolvimento.
3. **Verificação de negócio na Meta.** Documento rejeitado pode custar semanas.
   Começar isso **hoje**, em paralelo a tudo.
4. **Comportamento do nono dígito** (§3.4). Se a Cloud API não normalizar, volta
   a lógica de candidatos — e sem `contacts/check` ela fica cara (dois envios).

---

## Ao alterar este plano

- [ ] Mudou a arquitetura de contas → reveja §7.2 (roteamento), §5 (nº de
      templates) e o doc 03 inteiro.
- [ ] Meta mudou preço ou categoria → o número vive **só** no
      [02-custos](02-custos.md); aqui só o raciocínio.
- [ ] Fase concluída → marque o critério de saída atingido, com a data e o
      número medido. Um plano sem o que **de fato aconteceu** vira ficção em três meses.
