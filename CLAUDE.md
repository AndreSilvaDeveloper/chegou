# CLAUDE.md — Chegou 📦

> Documento de referência para LLMs e desenvolvedores sobre a arquitetura, funcionalidades,
> recursos e regras do projeto **Chegou**.

---

## 🎯 Visão do Produto

**Chegou** é um SaaS multi-tenant para gestão de condomínios com foco em **notificação de encomendas via WhatsApp**. A filosofia principal é: **o morador não precisa baixar nenhum app** — tudo acontece onde ele já está: no WhatsApp.

### Público-alvo
- **Síndicos**: Administradores do condomínio (admin do sistema)
- **Porteiros**: Operadores do dia a dia (recebem e entregam encomendas)
- **Equipe do condomínio**: Zeladores, faxineiros e demais funcionários
- **Moradores**: Recebem notificações via WhatsApp (sem acesso ao painel web)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Web)                           │
│  React 18 + Vite + TailwindCSS + shadcn/ui + Motion             │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS (REST API)
┌────────────────────────▼────────────────────────────────────────┐
│                     BACKEND (API)                               │
│  NestJS + TypeORM + Passport JWT                                │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  PostgreSQL │    Redis     │   S3/MinIO   │  OpenWA             │
│  (dados)    │  (BullMQ)    │  (fotos)     │  (1 sessão/condom.) │
└─────────────┴──────────────┴──────────────┴─────────────────────┘
```

**Tudo roda em Docker**: em dev pelo `docker-compose.yml` da raiz; em produção,
no servidor próprio, pelo `deploy/` (ver `deploy/README.md`). Não há provedor
gerenciado nem WhatsApp de terceiro no caminho.

### Um domínio, dois front-ends

`chegou.bellory.com.br` serve o site público **e** o painel. Quem divide é o
nginx interno da stack (`deploy/nginx/app.conf`; em dev, `nginx-dev.conf`):

| URL | Quem responde |
|---|---|
| `/` | **landing** (`landing/`) — marketing, SEO |
| `/app/...` | **painel** (`web/`) — todas as rotas internas |
| `/login` | redirect 301 → `/app/login` |
| `/cadastro/:token` | redirect 301 → `/app/cadastro/:token` (QR já impresso) |
| `/api/...` · `/fotos/...` | API NestJS e MinIO |

**O prefixo `/app` existe por causa do escopo do service worker.** Ele é um
prefixo de caminho: com o painel na raiz, o único escopo possível seria `/` — e
o SW do painel passaria a controlar e cachear a landing. Detalhe em
[landing/CLAUDE.md](landing/CLAUDE.md).

Os três arquivos que fazem isso funcionar, e que só funcionam **juntos**:
`base: '/app/'` (`web/vite.config.ts`), `basename="/app"` (`web/src/main.tsx`) e
o `location /app/` com **barra final** no `proxy_pass`.

### Multitenancy
- **Modelo**: Database compartilhado, schema compartilhado
- **Isolamento**: Toda tabela possui `tenant_id` (FK para `tenants`)
- **Exceções**: `superadmin` e `admin` têm `tenant_id = NULL`; audit_log e whatsapp_messages permitem NULL
- **Hierarquia**: `administradoras` → `tenants` (condomínios) → dados. Um condomínio
  pertence a no máximo uma administradora (`tenants.administradora_id`, NULL = direto
  com o superadmin)

#### Escopo da request (X-Tenant-Id)
O condomínio de cada request é resolvido pelo `TenantScopeGuard` e entregue às rotas
pelo `@TenantId()`. **Nenhum controller lê o header direto** — é isso que impede uma
rota nova de "esquecer" de validar:

| Papel | De onde vem o condomínio |
|---|---|
| `sindico` / `porteiro` | Do vínculo do usuário. Header divergente → 403 |
| `admin` | Do header `X-Tenant-Id`, validado contra a carteira. Fora dela → 403 |
| `superadmin` | Qualquer condomínio, mas as rotas de condomínio não o listam em `@Roles` — o caminho dele é `/admin/tenants/:id/...` |

A prova de isolamento fica em `test/multitenant.e2e-spec.ts` (duas administradoras,
três condomínios). Rode `npm run test:e2e` ao mexer em guard, role ou rota nova.

### Autenticação & Autorização
- JWT Bearer token via Passport
- Guards globais: `JwtAuthGuard` + `RolesGuard`
- Rotas públicas marcadas com `@Public()`
- Decorators: `@CurrentUser()`, `@TenantId()`, `@Roles(...)`

---

## 📦 Stack Tecnológica

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | >= 20 | Runtime |
| NestJS | 10.x | Framework HTTP |
| TypeORM | 0.3.x | ORM (entities mapeadas, sync desabilitado) |
| PostgreSQL | 16 | Banco de dados principal |
| Redis | 7 | Filas (BullMQ) e cache |
| BullMQ | 5.x | Processamento assíncrono de filas |
| bcrypt | 5.x | Hash de senhas |
| Joi | 17.x | Validação de variáveis de ambiente |
| node-pg-migrate | 7.x | Migrations SQL |
| AWS SDK S3 | 3.x | Upload de fotos (S3/MinIO/R2) |

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18.x | UI Library |
| Vite | 5.x | Build tool e dev server |
| TailwindCSS | 3.x | Estilização utility-first |
| shadcn/ui | latest | Componentes UI (Radix + Tailwind) |
| Lucide React | latest | Biblioteca de ícones SVG |
| Motion (framer-motion) | latest | Animações e transições |
| React Router DOM | 6.x | Roteamento SPA |
| html5-qrcode | 2.x | Leitor de QR/barcode via câmera |
| vite-plugin-pwa | 1.x | Progressive Web App |

### Tipografia
- **Font principal**: Poppins (Google Fonts)
- **Font monospace**: JetBrains Mono (códigos, telefones)
- **Tamanho vem da escala `txt-*`**, nunca de `text-sm`/`text-lg` solto — ver
  "Escala tipográfica" no Design System abaixo

### Infraestrutura
| Serviço | Uso |
|---|---|
| Docker Compose (dev) | Postgres, Redis, MinIO, Adminer, API e web |
| Servidor próprio (prod) | Mesma stack via `deploy/` — `git pull` + `./deploy.sh`, atrás do reverse proxy |
| MinIO / Cloudflare R2 | Storage de fotos e contratos |
| Redis | Filas BullMQ |
| OpenWA | Gateway WhatsApp, uma sessão por condomínio |

---

## 📁 Estrutura do Projeto

```
chegou/
├── src/                          # Backend NestJS
│   ├── main.ts                   # Bootstrap da aplicação
│   ├── app.module.ts             # Módulo raiz
│   ├── common/                   # Utilitários compartilhados
│   │   ├── decorators/           # @Public, @Roles, @TenantId, @CurrentUser
│   │   ├── guards/               # JwtAuthGuard, RolesGuard
│   │   ├── interceptors/         # AuditInterceptor (a implementar)
│   │   └── services/             # AuditService, etc.
│   ├── config/                   # Validação de env vars (Joi)
│   ├── database/                 # DatabaseModule + entities centralizadas
│   │   └── entities/             # Todas as entidades TypeORM
│   ├── queues/                   # Configuração BullMQ (filas globais)
│   └── modules/                  # Módulos de domínio
│       ├── admin/                # Gestão de tenants (superadmin)
│       ├── apartamentos/         # CRUD de apartamentos
│       ├── auth/                 # Login, JWT, refresh token
│       ├── encomendas/           # Core: receber, notificar, retirar
│       ├── equipe/               # Gestão de funcionários do condomínio
│       ├── health/               # Healthcheck
│       ├── moradores/            # CRUD de moradores
│       ├── notification/         # Fila de notificações unificada
│       ├── storage/              # Upload de fotos (S3)
│       ├── usuarios/             # Gestão de usuários (login)
│       ├── vagas/                # Vagas de garagem + cobrança
│       └── whatsapp/             # Gateway WhatsApp + webhooks
├── web/                          # Frontend React — o PAINEL, servido em /app/
│   ├── src/
│   │   ├── main.tsx              # Entry point React
│   │   ├── App.tsx               # Router + rotas
│   │   ├── styles.css            # Design system + Tailwind
│   │   ├── lib/                  # Utilitários (cn, formatters)
│   │   ├── hooks/                # Custom hooks React
│   │   ├── api/                  # API client + types
│   │   ├── components/           # Componentes de negócio
│   │   │   └── ui/               # Componentes shadcn/ui
│   │   └── pages/                # Páginas do app
│   ├── public/                   # Assets estáticos
│   └── tailwind.config.js        # Configuração Tailwind
├── landing/                      # Site público (Next.js), servido em /
├── db/
│   └── migrations/               # Migrations SQL (node-pg-migrate)
├── scripts/                      # Scripts utilitários (seed, etc.)
├── test/                         # Testes e2e
├── docker-compose.yml            # Dev: Postgres, Redis, MinIO, Adminer
├── Dockerfile                    # Build de produção do backend
├── CLAUDE.md                     # Este arquivo
└── DEPLOY.md                     # Guia de deploy
```

---

## 🗃️ Modelo de Dados

### Tabelas
| Tabela | `tenant_id`? | Descrição |
|---|:---:|---|
| `administradoras` | — | Empresas que administram carteiras de condomínios |
| `tenants` | — | Condomínios; `administradora_id` liga à carteira |
| `users` | opcional | Logins do painel (ver escopo por papel abaixo) |
| `apartamentos` | ✅ | Unidades do condomínio (bloco + número → identificador) |
| `moradores` | ✅ | Moradores com telefone WhatsApp |
| `encomendas` | ✅ | Encomendas recebidas na portaria |
| `funcionarios` | ✅ | Equipe do condomínio (zelador, faxineiro, etc.) |
| `vagas` | ✅ | Vagas de garagem/estacionamento |
| `vagas_locacao` | ✅ | Locações de vaga (morador ou pessoa externa) |
| `vagas_precos` | ✅ | Tabela de preço sugerido por tipo de vaga |
| `vagas_cobrancas` | ✅ | Cobrança mensal da locação, por competência |
| `avisos` | ✅ | Comunicados do condomínio para moradores |
| `etiqueta_amostras` | opcional | Etiquetas de exemplo que calibram a leitura por foto |
| `assinatura_faixas` | — | Tabela de preços da plataforma (por apartamento) |
| `assinatura_condicoes` | opcional | Preço especial de um condomínio **ou** de uma administradora |
| `assinatura_faturas` | opcional | Fatura mensal da assinatura (condomínio **ou** administradora) |
| `assinatura_fatura_itens` | opcional | Composição da fatura, um item por condomínio |
| `assinatura_clientes_gateway` | opcional | Vínculo do cliente com o `customer` do gateway de pagamento |
| `assinatura_webhook_eventos` | — | Eventos de pagamento recebidos do gateway (dedup por `evento_id`) |
| `assinatura_politica_acesso` | — | Política de bloqueio por inadimplência (linha única) |
| `assinatura_cupom_cliente` | opcional | Atribuição de cupom de desconto a um cliente |
| `notificacoes` | ✅ | Fila unificada de disparos (encomenda, cobrança, aviso) |
| `whatsapp_messages` | permite NULL | Histórico de mensagens (in/out) |
| `audit_log` | permite NULL | Log de auditoria de ações |

> Toda tabela nova de dado de condomínio nasce com `tenant_id NOT NULL` +
> `REFERENCES tenants(id) ON DELETE CASCADE`. As exceções acima são deliberadas:
> `whatsapp_messages` aceita NULL porque uma mensagem de número desconhecido não
> tem dono, `etiqueta_amostras` porque uma etiqueta da Shopee é igual em todo
> condomínio (lá o `tenant_id` só registra a origem), `audit_log` registra
> também ações de plataforma, e as tabelas de
> **assinatura** cobram ora um condomínio, ora uma administradora — nelas um
> CHECK (`tenant_id` XOR `administradora_id`) faz o papel do `NOT NULL`.

### Roles do Sistema
| Role | Acesso | Escopo no banco | Login de Teste (Seed) |
|---|---|---|---|
| `superadmin` | Plataforma inteira | `tenant_id` e `administradora_id` NULL | `admin@portaria.app` / `senha123` |
| `admin` | **Administradora**: carteira de condomínios | `tenant_id` NULL + `administradora_id` obrigatório | `admin@central.app` / `senha123` |
| `sindico` | Gestão de um condomínio | `tenant_id` obrigatório | `sindico@bela-vista.app` / `senha123` |
| `porteiro` | Operação de portaria | `tenant_id` obrigatório | `porteiro@bela-vista.app` / `senha123` |

> O CHECK `chk_users_escopo` garante essa combinação no banco — não dá para criar
> uma administradora presa a um condomínio nem um síndico com carteira.

### O que cada perfil faz

Fonte da verdade: os decorators `@Roles(...)` nos controllers. Esta tabela é o
resumo — ao mudar um decorator, atualize aqui **e** na doc do módulo.

| Área | superadmin | admin (administradora) | sindico | porteiro |
|---|:---:|:---:|:---:|:---:|
| Condomínios da plataforma (criar/editar/ativar) | ✅ | — | — | — |
| Administradoras (criar, carteira, acessos) | ✅ | — | — | — |
| Gestão de qualquer condomínio (`/admin/tenants/:id/...`) | ✅ | — | — | — |
| Módulos contratados e plano do condomínio | ✅ | — | — | — |
| Assinatura: tabela de preços, preço especial, gerar e dar baixa em fatura | ✅ | — | — | — |
| Assinatura: cliente no gateway de pagamento (pendências e sincronizar) | ✅ | — | — | — |
| Assinatura: emitir e reemitir cobrança da fatura | ✅ | — | — | — |
| Assinatura: conciliar cobranças e ver pendências de cobrança | ✅ | — | — | — |
| Assinatura: política de bloqueio por inadimplência | ✅ | — | — | — |
| Assinatura: cupons de desconto (criar, desativar, atribuir a cliente) | ✅ | — | — | — |
| Webhook de pagamento (`POST /webhooks/pagamentos`) | *público, validado por token do gateway* ||||
| Assinatura própria: abrir o link de pagamento da fatura | — | ✅ | ✅⁴ | — |
| Assinatura de um condomínio: preço especial e dia de vencimento dele | ✅ | ⁶ | — | — |
| Banco de amostras de etiqueta (calibrar a leitura por foto) | ✅ | — | — | — |
| Ler etiqueta por foto ao registrar encomenda | — | — | ✅ | ✅ |
| Carteira própria (listar/criar/editar condomínios) | — | ✅ | — | — |
| Configurar condomínio da carteira: cadastro, tipo, blocos, janela de envio | ✅ | ✅⁵ | — | — |
| Endereço completo do condomínio (CEP, logradouro, nº, compl., bairro, cidade, UF) | ✅ | ✅ | ✅ | — |
| Consultar CEP (`GET /cep/:cep`, preenche o endereço) | ✅ | ✅ | ✅ | — |
| Assinatura própria: quanto paga e as faturas (só leitura) | — | ✅³ | ✅⁴ | — |
| Dashboard e relatórios | — | ✅ | ✅ | — |
| Encomendas: registrar, listar, dar baixa | — | ✅ | ✅ | ✅ |
| Encomendas: cancelar, exportar, estatísticas | — | ✅ | ✅ | — |
| Apartamentos e moradores: consultar | — | ✅ | ✅ | ✅ |
| Apartamentos e moradores: editar/remover/importar | — | ✅ | ✅ | — |
| Moradores: gerar/revogar link de autocadastro (QR) | — | ✅ | ✅ | — |
| Autocadastro de morador (página pública `/cadastro/:token`) | \*público — sem login, condomínio vem do token\* ||||
| Cadastrar unidade | — | ✅ | ✅ | ✅ |
| Vincular/desvincular vaga da unidade | — | ✅ | ✅ | — |
| Equipe (funcionários) | — | ✅ | ✅ | — |
| Usuários do condomínio (criar síndico/porteiro) | ✅¹ | ✅ | ✅ | — |
| Vagas: consultar | — | ✅ | ✅ | ✅ |
| Vagas: cadastrar, alugar, preços, cobranças | — | ✅ | ✅ | — |
| Vagas: histórico financeiro (contratos, pagamentos) | — | ✅ | ✅ | — |
| WhatsApp: ritmo de envio do condomínio | ✅² | ✅ | ✅ | — |
| Avisos: ler | — | ✅ | ✅ | ✅ |
| Avisos: publicar/remover | — | ✅ | ✅ | — |
| Filas de notificação e WhatsApp do condomínio | — | ✅ | ✅ | — |

¹ O superadmin cria usuários pelas rotas `/admin/tenants/:id/usuarios`, não pela
rota `/usuarios` (que é do condomínio). Ninguém cria `superadmin` pela API.

² O superadmin edita o mesmo dado na aba WhatsApp do condomínio
(`/admin/condominios/:id`), sem as faixas de segurança que valem para o síndico
(intervalo ≥ 90s, janela dentro de 08:00–21:00, limite de 20 a 300/dia) e com o
jitter, que o condomínio nem enxerga. Não há painel consolidado de WhatsApp: a
sessão é de um condomínio de cada vez. **O texto das mensagens não é editável
por ninguém** — são cinco versões fixas de cada tipo, sorteadas a cada envio
(ver "Regras Anti-Bloqueio" abaixo).

³ A conta da administradora é a da **carteira inteira**, em
`/minha-administradora/assinatura` — não a de um condomínio. É a única coisa que
ela vê sem escolher condomínio no `X-Tenant-Id`.

⁴ Só quando o condomínio é direto. Em condomínio de carteira quem paga é a
administradora, e a tela do síndico diz isso em vez de mostrar conta vazia.

⁵ **Só o operacional** — o que descreve o condomínio. Plano, ativar/desativar e
módulos contratados descrevem o *contrato* e continuam só no superadmin.
`ativo` em especial: condomínio inativo sai da conta da assinatura, então esse
botão na mão de quem paga a fatura seria o botão de baixar a própria conta. A
tela dela é `/meus-condominios/:id`; a do superadmin, `/admin/condominios/:id`.

⁶ **Só leitura, e sem entrar no condomínio.** A administradora abre a aba
"Assinatura" de um condomínio da carteira para ver quanto ele pesa na conta dela
e o histórico de cobrança dele — negociar preço e vencimento é do superadmin. O
condomínio vem da URL (`/minha-administradora/condominios/:id/assinatura`), mas
a carteira sai do usuário logado: condomínio de outra carteira responde 404.

**A administradora só enxerga isso dentro dos condomínios da carteira dela**, e
sempre com o condomínio escolhido no header `X-Tenant-Id` — as exceções são as
duas rotas de `/minha-administradora/...`, onde o condomínio vem da URL e a
carteira do usuário logado. Ver "Escopo da request" acima.

### 🚦 Regra de ouro para funcionalidade nova

> **Antes de escrever a primeira linha de uma funcionalidade nova, PERGUNTE ao
> usuário quais perfis podem vê-la e usá-la.** Não presuma pelo que parece
> "óbvio" — porteiro e administradora costumam ser os casos que passam batido.

A pergunta deve cobrir três pontos:

1. **Quem vê** (quais dos quatro perfis), separando leitura de escrita quando
   fizer diferença — é comum o porteiro poder consultar mas não editar.
2. **Se é um módulo opcional** (como Vagas e Avisos): entra em `config_json` do
   condomínio e precisa de `@RequiresModule`, ou vale para todo condomínio?
3. **Se a administradora opera de fora**: a funcionalidade é do condomínio
   (precisa de `X-Tenant-Id`) ou da carteira (`/minha-administradora/...`)?

Com a resposta em mãos: aplique `@Roles(...)` no backend, `allowedRoles` na rota
do frontend, filtre o item no menu (`NAV_ITEMS` em `web/src/components/Layout.tsx`)
e registre na tabela acima e na doc do módulo.

---

## 🔌 Módulos de Domínio

**Cada módulo tem o seu próprio `CLAUDE.md`** com rotas, perfis, regras de
negócio e o que revisar ao alterar. Este arquivo guarda só a regra geral; o
detalhe mora ao lado do código e é lido automaticamente quando se trabalha
naquela pasta.

| Módulo | Doc | Em uma linha |
|---|---|---|
| Encomendas | [src/modules/encomendas](src/modules/encomendas/CLAUDE.md) | Core: receber, notificar, entregar com código |
| Etiquetas | [src/modules/etiquetas](src/modules/etiquetas/CLAUDE.md) | Ler a etiqueta do pacote por foto (OCR próprio + parser) |
| Apartamentos | [src/modules/apartamentos](src/modules/apartamentos/CLAUDE.md) | Unidades do condomínio, blocos e importação |
| Moradores | [src/modules/moradores](src/modules/moradores/CLAUDE.md) | Quem mora e por onde recebe WhatsApp |
| Vagas | [src/modules/vagas](src/modules/vagas/CLAUDE.md) | Garagem, locação, preços e cobrança (opcional) |
| Avisos | [src/modules/avisos](src/modules/avisos/CLAUDE.md) | Comunicados para os moradores (opcional) |
| Equipe | [src/modules/equipe](src/modules/equipe/CLAUDE.md) | Funcionários do condomínio, sem acesso ao sistema |
| Usuários | [src/modules/usuarios](src/modules/usuarios/CLAUDE.md) | Logins do condomínio (síndico e porteiro) |
| Auth | [src/modules/auth](src/modules/auth/CLAUDE.md) | Login, JWT e `/auth/me` |
| Administradoras | [src/modules/administradoras](src/modules/administradoras/CLAUDE.md) | Carteira de condomínios da administradora |
| Admin | [src/modules/admin](src/modules/admin/CLAUDE.md) | Rotas de plataforma do superadmin |
| Notificações | [src/modules/notificacoes](src/modules/notificacoes/CLAUDE.md) | Fila unificada com as regras anti-bloqueio |
| WhatsApp | [src/modules/whatsapp](src/modules/whatsapp/CLAUDE.md) | Histórico de mensagens, respostas ao morador e webhook de entrada |
| OpenWA | [src/modules/openwa](src/modules/openwa/CLAUDE.md) | Sessão não-oficial por condomínio (QR, status) |
| Relatórios | [src/modules/relatorios](src/modules/relatorios/CLAUDE.md) | Consultas agregadas para as telas de relatório |
| Assinaturas | [src/modules/assinaturas](src/modules/assinaturas/CLAUDE.md) | O que o cliente paga pelo Chegou (por apartamento, em faixas) |
| Pagamentos | [src/modules/pagamentos](src/modules/pagamentos/CLAUDE.md) | O gateway de cobrança (Payment API/Asaas): cliente, cobrança e acesso |
| CEP | [src/modules/cep](src/modules/cep/CLAUDE.md) | Consulta de CEP que preenche o endereço do condomínio |
| Storage | [src/modules/storage](src/modules/storage/CLAUDE.md) | Upload de fotos e contratos (S3/MinIO/R2) |
| Common | [src/common](src/common/CLAUDE.md) | Guards, decorators, escopo de tenant e auditoria |
| Frontend | [web/src](web/src/CLAUDE.md) | Páginas, componentes, hooks e client da API |
| Componentes de UI | [web/src/components/ui](web/src/components/ui/CLAUDE.md) | **Catálogo da identidade visual**: quero X → use Y, as seis leis, checklist de PR |
| Landing | [landing](landing/CLAUDE.md) | Site público na raiz do domínio; por que o painel vive em `/app/` |

---

## 📚 Documentação viva

A documentação é dividida em duas camadas, e cada uma tem um dono claro:

| Camada | Onde | O que guarda |
|---|---|---|
| Geral | este arquivo | Arquitetura, perfis de acesso, padrões e regras que valem para o projeto inteiro |
| Local | `CLAUDE.md` de cada módulo | Rotas + perfis, entidades, regras de negócio e armadilhas daquele módulo |
| Planejado | `docs/` | Trabalho combinado que ainda não virou código |

### Entregue, mas vale ler

| Doc | Por que ainda importa |
|---|---|
| [Cobrança pela Payment API](docs/plano-cobranca-gateway.md) | As **seis fases estão no código**. O documento continua valendo como registro das decisões e do que mudou na implementação — inclusive o que foi feito **diferente** do combinado, e por quê. A regra viva mora em [Assinaturas](src/modules/assinaturas/CLAUDE.md) e [Pagamentos](src/modules/pagamentos/CLAUDE.md) |
| [Landing + painel no mesmo domínio](docs/plano-landing-monorepo.md) | **Implementado.** Guarda o porquê de **não** migrar o painel para Next.js — e, no § 11, por que a **landing** acabou indo (SEO, fontes auto-hospedadas e `/llms.txt`), contra o que o § 5 tinha combinado. A regra viva mora em [landing](landing/CLAUDE.md) |

**Por que `CLAUDE.md` e não `README.md`**: arquivos `CLAUDE.md` em subpastas são
carregados automaticamente no contexto quando se trabalha naquela pasta. Na
prática, quem for mexer em `src/modules/vagas/` já chega sabendo as regras da
vaga vinculada a apartamento, sem precisar procurar.

### Ao alterar um módulo (front ou back), atualize a doc dele
Não é burocracia: é o que impede a próxima alteração de quebrar uma regra que
ninguém lembrava. O que precisa estar em dia:

- rota nova/alterada/removida → tabela de rotas e perfis
- campo novo na entidade → seção de dados
- regra de negócio nova → seção de regras, **com o porquê**
- decisão que você levou tempo para tomar → "Decisões e armadilhas"

Cada doc de módulo tem uma seção **"Ao alterar este módulo"** com o checklist
específico dele.

### Skills do projeto
Fluxos repetitivos viram skill em `.claude/skills/`, para o passo a passo ser o
mesmo toda vez (e ninguém esquecer de perguntar os perfis nem de atualizar a doc):

| Skill | Quando usar |
|---|---|
| `funcionalidade-nova` | Qualquer funcionalidade nova — começa perguntando os perfis de acesso |
| `modulo-backend` | Criar um módulo NestJS novo (controller, service, DTO, entidade, migration, doc) |
| `tela-frontend` | Criar página ou diálogo no painel, com os padrões de UI e de acesso |
| `tela-listagem` | Montar ou converter uma tela de listagem/cadastro no layout padrão (faixa âmbar no celular, tabela no desktop) |
| `auditar-multitenant` | Revisar isolamento entre condomínios depois de mexer em query, guard ou DTO |
| `dataviz` (embutida) | **Antes** de escrever qualquer gráfico ou escolher cor de série — traz o validador de paleta |

> **A identidade visual não é skill, é doc**: ela vive em
> [web/src/components/ui/CLAUDE.md](web/src/components/ui/CLAUDE.md) e é
> carregada sozinha ao trabalhar em `components/ui/`. As skills de tela apontam
> para lá em vez de repetir as regras — regra repetida é regra que diverge.

---

## 🛡️ Regras Anti-Bloqueio WhatsApp (API Não-Oficial)

> **CRÍTICO**: Estas regras DEVEM ser seguidas rigorosamente para evitar
> bloqueio do número WhatsApp do condomínio.

### Controle de Taxa (Rate Limiting)
1. **Delay entre mensagens**: **90 segundos fixos + 0 a 90 aleatórios** (1min30 a
   3min entre um envio e o seguinte do mesmo número). O síndico pode subir daí,
   nunca descer
2. **Lotes**: Máximo **15 mensagens por lote**, pausa de **3 a 8 minutos** entre lotes
3. **Limite diário**: Máximo configurável por número (padrão: **100/dia**, escalar gradualmente)
4. **Warm-up de número novo**: Iniciar com 10-20/dia, aumentar 10 a cada 3 dias

### Janela de Envio
5. **Horário comercial**: Enviar apenas entre **8h e 21h** (horário local). O
   síndico ajusta a janela em `/whatsapp`, mas **só para dentro** desse
   intervalo — esticar para a madrugada é o que queima o número. Quem pode sair
   da faixa é o superadmin, na aba WhatsApp daquele condomínio
   (`/admin/condominios/:id`)
6. **Sem envio em massa simultâneo**: Fila serializada por número remetente

### Conteúdo
7. **Cinco versões de cada texto, sorteadas por envio**: chegada e retirada têm
   cada uma **5 redações diferentes** em `src/modules/notificacoes/message-template.ts`,
   e o sistema sorteia uma no enfileiramento. Texto único repetido para dezenas
   de destinatários é o padrão que marca o número como spam
7.1. **Saudação pelo horário**: toda versão abre com `{{saudacao}}` — Bom dia /
   Boa tarde / Boa noite —, resolvida na **hora em que a mensagem sai**, não na
   em que foi criada
7.2. **Ninguém personaliza o texto**: nem o síndico, nem a administradora, nem o
   superadmin. Variação controlada vale mais que liberdade de edição, e um
   cliente colando o mesmo texto em todo envio derrubaria o próprio número
8. **Personalização**: Toda mensagem deve ter dados específicos do destinatário
9. **Sem links suspeitos**: Evitar encurtadores de URL

### Monitoramento e Saúde
10. **Taxa de erro**: Se > 10% de falhas na última hora, pausar envios por 30 minutos
11. **Circuit breaker**: Após 3 falhas consecutivas, pausar por 5 minutos e notificar admin
12. **Logs completos**: Registrar todo envio/falha em `whatsapp_messages`

### Implementação Técnica (BullMQ)

O ritmo **não** vem de um limiter da fila: vem do `delay` calculado no
enfileiramento (slot por condomínio) somado à trava de um envio por condomínio.
É o que permite muitos condomínios enviarem em paralelo sem que nenhum número
saia do passo.

| Camada | Garantia | Onde ajustar |
|---|---|---|
| Fila | 15 condomínios em paralelo | `NOTIFICATION_CONCURRENCY` |
| Condomínio | 1 envio por vez | trava `wa:envio:{tenant}` (Redis) |
| Mensagem | intervalo + jitter | config do condomínio (tela `/whatsapp`) |
| Dia | cota por dia de **envio** | `wa:cota:{tenant}:{dia}` |

Detalhes e armadilhas: [módulo Notificações](src/modules/notificacoes/CLAUDE.md).

---

## 🎨 Design System (Frontend)

### Princípios
1. **Premium e moderno**: Glassmorphism, gradientes suaves, micro-animações
2. **Mobile-first**: O porteiro usa no celular na portaria
3. **Dark mode**: Suporte com toggle (preferência salva em localStorage)
4. **Consistência**: Todos os componentes via shadcn/ui
5. **Acessibilidade**: ARIA labels, contraste adequado, foco visível

### Paleta de Cores — claro **papel quente** (em teste) · escuro **grafite** (original)

> Todas as cores vivem em tokens CSS (`web/src/styles.css`). **Nenhum componente
> tem cor fixa** — trocar o tema é trocar os tokens. Para voltar ao tema
> anterior (Graphite/zinc), os valores estão no bloco comentado
> "TEMA ANTERIOR" no fim daquele arquivo.

**Sinal**: `#FFC72C` (âmbar) — reservado para ação e foco. Texto sobre ele:
`#3A2003` (10:1).

**Hierarquia de superfícies** — 4 níveis. Nos **dois temas o card sobe**: ele
flutua sobre a folha, que é o tom mais fechado.

| Nível | Token | Claro | Escuro | Papel |
|---|---|---|---|---|
| Shell | `--sidebar` | `#E8E4DE` | `#0A0A0A` | Menu e topo — moldura de tudo |
| Folha | `--background` | `#F3F0EA` | `#121212` | Área de trabalho **e campos de formulário** |
| Card | `--card` | `#FDFCFA` | `#1A1A1A` | O conteúdo, elevado |
| Flutuante | `--popover` | `#FFFFFF` | `#1A1A1A` | Diálogo, gaveta, menu suspenso |

No claro os neutros são **greige** (matiz 36°, a 8° do âmbar): neutro quente sem
puxar para o rosa, e o sinal amarelo pertence à cena em vez de brigar com ela.
Saturação baixa de propósito — o tom só aparece nas áreas grandes.

**O que separa um nível do outro**, nesta ordem: o degrau de **tom**, a
**sombra** (`shadow-panel`) e, por último, um fio de borda (`--border-surface`)
que quase não se vê. A borda deixou de ser a protagonista — era ela que dava o
ar de formulário antigo, com tudo dentro de uma caixa dentro de outra. O tom vem
primeiro porque o porteiro usa o app no sol da portaria, onde sombra some.

> **Card dentro de card é proibido.** Duas sombras empilhadas viram sujeira, e o
> aninhamento é o que deixava a tela pesada.

**Blocos dentro do card** (`--muted` / `--secondary`, claro `#F6F3EE`) são
**chapados**: preenchimento e raio, sem borda e sem sombra. É o preenchimento
que os delimita. Esse bloco é o substituto do card-dentro-de-card.

Regra prática: **campo de formulário usa a folha**. Nos dois temas ele fica mais
escuro que o card e afunda nele — o mesmo gesto no claro e no escuro, em vez de
um invertido em relação ao outro.

**Raio**: controles (botão, campo, badge) em `--radius` (12px); superfícies
(card, diálogo, gaveta) em `--radius-surface` (20px), pela classe
`rounded-surface`. O raio maior é o que dá o ar arredondado sem deformar campo
e botão.

| Papel | Claro | Escuro |
|---|---|---|
| Texto principal | `#1A1714` (16.8:1 no card) | `#FAFAFA` (15:1) |
| Texto secundário | `#625A50` (6.4:1) | `#A3A3A3` (7:1) |
| Borda de controle | `#D7D0C6` | `#2A2A2A` |
| Borda de superfície | `#EDE9E2` (um fio) | `#262626` |
| Sucesso / Aviso / Erro | Emerald / Amber / Red (mantidos) | idem |

### Escala tipográfica — uma classe por papel

Assim como nenhuma cor é escrita em hexadecimal, **nenhum tamanho de fonte é
escrito à mão**. A escala vive em `web/src/styles.css` e cada classe é um papel.
É a escala padrão de painel web (shadcn/ui): **o mesmo tamanho em qualquer
viewport**.

| Classe | Tamanho | Papel |
|---|---|---|
| `txt-numero` | 24px | KPI, número em destaque |
| `txt-numero-sm` | 18px | valor numérico em linha (total, contador) |
| `txt-titulo` | 24px | título da tela — um por tela |
| `txt-secao` | 16px | título de card, diálogo, seção |
| `txt-subtitulo` | 14px | nome do item no card, subtítulo de bloco |
| `txt-corpo` | 14px | texto padrão, campo, botão, tabela |
| `txt-apoio` | 14px | descrição, dica, texto secundário |
| `txt-nota` | 12px | chrome: badge, legenda de gráfico, atalho |
| `eyebrow` | 11px | rótulo mono maiúsculo acima do título |

**Três papéis dividem os 14px** (`txt-subtitulo`, `txt-corpo`, `txt-apoio`).
Numa escala padrão os degraus são curtos, então o que separa esses três passa a
ser **peso e cor**, não tamanho: `txt-subtitulo font-semibold` para o nome do
item, `txt-corpo` para o texto, `txt-apoio text-muted-foreground` para o
secundário. As classes continuam existindo com a mesma medida porque elas dizem
o **papel** — e é o papel que a próxima retunagem da escala vai precisar
distinguir. Trocar uma pela outra "porque dá no mesmo" é o que quebra isso.

> A escala já cresceu no celular (corpo 16px, título 30px no desktop) por causa
> de um público-alvo de usuário mais velho. Essa premissa saiu do produto. Se
> voltar, o lugar de mudar é `web/src/styles.css` — e só ele.

Os componentes de `web/src/components/ui/` já trazem a classe certa (título de
card, label, campo, botão, badge, tabela) — **repetir a classe na tela é ruído**
e é assim que a divergência volta. Detalhe e checklist: [web/src](web/src/CLAUDE.md).

### Componentes shadcn/ui Utilizados
- Button, Input, Label, Select, Textarea
- Card, Badge, Avatar
- Dialog (Modal), AlertDialog
- Table, Tabs
- Dropdown Menu, Command (search)
- Skeleton, Toast (Sonner)
- Sheet (sidebar mobile)
- Tooltip, Popover

### Animações (Motion / Framer Motion)
- **Page transitions**: Fade + slide-up ao trocar de página
- **List items**: Stagger animation ao carregar listas
- **Cards**: Scale on hover
- **Modals**: Spring animation de entrada/saída
- **Toasts**: Slide-in da direita
- **Números/KPIs**: Count-up animation no dashboard

---

## 📱 Mobile-First & Acessibilidade

> **REGRA FUNDAMENTAL**: O porteiro trabalha **no celular, em pé na portaria**.
> Mobile-first não é preferência estética — é onde o sistema é usado de verdade.

> **O que saiu**: o projeto já tratou o porteiro como um público que precisa de
> fonte aumentada, alvo de toque de 48px, rótulo sempre visível e nenhum botão
> só de ícone. Essa premissa foi retirada do produto: a interface segue os
> **padrões do shadcn/ui**, iguais aos de qualquer painel web. O que continua
> valendo abaixo vale por ser boa prática de UI, não por causa daquele público.

### Mobile-First
1. **Abordagem**: Desenvolver primeiro para mobile, depois adaptar para desktop
2. **Breakpoints**: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px` (TailwindCSS padrão)
3. **Layout mobile**: Uma coluna, conteúdo empilhado verticalmente
4. **Layout desktop**: Sidebar fixa + conteúdo expandido
5. **Tamanhos de controle**: os padrões do shadcn (`Button` `h-9`, `Input` `h-9`).
   Não force altura à mão — se um controle precisa destoar, use a variante
   (`size="lg"`, `size="sm"`) para a exceção ficar legível
6. **Espaçamento**: `gap-3` entre elementos interativos
7. **FAB (Floating Action Button)**: Ação principal acessível no canto inferior direito no mobile

### Acessibilidade
8. **Tamanho de texto**: sempre da escala (`txt-*`) — ver "Escala tipográfica".
   `txt-nota` é chrome (badge, legenda), não texto que precisa ser lido
9. **Contraste alto**: Ratio mínimo 4.5:1 (WCAG AA) — testar com ferramentas de contraste
10. **Botão só de ícone**: permitido, mas **sempre com `aria-label`** — sem ele o
    botão não existe para leitor de tela
11. **Feedback visual claro**: States de loading, sucesso e erro devem ser óbvios
12. **Formulários**: um campo por linha no mobile. `Label` é o padrão; usar
    placeholder como rótulo é aceito só onde o campo é auto-evidente (busca),
    e nesse caso o campo precisa de `aria-label`
13. **Navegação simples**: Máximo 7 itens visíveis na sidebar, agrupados logicamente
14. **Confirmação de ações destrutivas**: Sempre usar Dialog com texto claro
15. **Sem gestos complexos**: Evitar swipe, long-press ou double-tap — usar botões explícitos
16. **Scroll vertical apenas**: Evitar scroll horizontal em qualquer viewport

### Componentes Mobile-First
```
// ❌ ERRADO: Desktop-first
<div className="flex flex-row gap-4">
  <Card className="w-1/3" />
  <Card className="w-1/3" />
  <Card className="w-1/3" />
</div>

// ✅ CORRETO: Mobile-first
<div className="flex flex-col gap-3 md:flex-row md:gap-4">
  <Card className="w-full md:w-1/3" />
  <Card className="w-full md:w-1/3" />
  <Card className="w-full md:w-1/3" />
</div>
```

### Regras de Teste de Responsividade
- Testar em viewports: 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1024px (laptop)
- Nenhum texto deve ser cortado ou overflow em 375px
- Tabelas devem usar scroll horizontal OU transformar em cards no mobile
- Modais devem ocupar tela cheia no mobile (`Sheet` do shadcn no mobile, `Dialog` no desktop)

---

## 📐 Convenções de Código

### Backend (NestJS/TypeScript)
- **Idioma do código**: Inglês para nomes de variáveis, classes e métodos
- **Idioma do domínio**: Português para entidades de negócio (`Encomenda`, `Morador`, `Apartamento`)
- **Entidades**: Centralizadas em `src/database/entities/`, NUNCA duplicar
- **Módulos**: Um diretório por módulo em `src/modules/`
- **DTOs**: Usar `class-validator` + `class-transformer`
- **Migrations**: SQL puro via `node-pg-migrate`, NUNCA `synchronize: true`
- **Soft delete**: Usar `ativo: boolean` em vez de deletar registros
- **Nomenclatura de tabelas**: snake_case plural (`apartamentos`, `moradores`)
- **Nomenclatura de colunas**: snake_case (`tenant_id`, `created_at`)
- **UUIDs**: Usar `gen_random_uuid()` do PostgreSQL (extensão pgcrypto)
- **Timestamps**: Sempre `timestamptz` (com timezone)

### Frontend (React/TypeScript)
- **Componentes**: Functional components com hooks
- **Estilização**: TailwindCSS + shadcn/ui (NUNCA CSS inline ou styled-components)
- **Ícones**: SOMENTE Lucide React (NUNCA emojis como ícones)
- **Animações**: SOMENTE Motion/Framer Motion
- **Tipografia**: Poppins (NUNCA fontes padrão do navegador)
- **Estado**: useState/useReducer para estado local; sem state manager global (por enquanto)
- **API calls**: Centralizadas em `src/api/client.ts`
- **Types**: Centralizados em `src/api/types.ts`
- **Pastas**: `pages/` para rotas, `components/` para reutilizáveis, `components/ui/` para shadcn
- **Path aliases**: Usar `@/` para imports (`@/components/ui/button`)

### Peças reutilizáveis (use antes de escrever de novo)

| Peça | Onde | Para quê |
|---|---|---|
| `assertRefDoTenant()` | `src/common/tenant-scope/tenant-ref.ts` | Validar que um id do corpo é do condomínio da request |
| `@TelefoneE164()` | `src/common/telefone.ts` | Campo de telefone: aceita `(32) 99999-9999`, grava E.164 |
| `@DocumentoBrasileiro()` | `src/common/documento.ts` | Campo de CPF/CNPJ: tira a máscara e confere os dígitos verificadores |
| `@Cep()` | `src/common/cep.ts` | Campo de CEP: aceita `36010-000`, grava só dígitos |
| `EnderecoDto` / `aplicarEndereco()` | `src/common/endereco.dto.ts` | Endereço completo do condomínio nos três DTOs que o editam |
| `@TenantId()` | `src/common/decorators` | Condomínio da request, já validado |
| `@TenantScope()` | `src/common/decorators` | Igual, mas aceita "sem condomínio" (`null`) |
| `@AdministradoraId()` | `src/common/decorators` | Carteira do usuário logado |
| `@Roles(...)` / `@RequiresModule(...)` | `src/common/decorators` | Perfis e módulo opcional da rota |
| `TenantConfigService` | `src/common/tenant-config` | Ler `config_json` do condomínio com cache |
| `FormDialog` | `web/src/components/ui/form-dialog.tsx` | Casca de formulário em diálogo (rolagem, empilhamento, salvando) |
| `PhoneInput` | `web/src/components/ui/phone-input.tsx` | Telefone mascarado `(32) 99999-9999` → E.164 |
| `DocumentoInput` | `web/src/components/ui/documento-input.tsx` | CPF/CNPJ mascarado enquanto se digita → só dígitos para a API |
| `CepInput` | `web/src/components/ui/cep-input.tsx` | CEP mascarado `00000-000` → só dígitos para a API |
| `EnderecoFields` | `web/src/components/condominio/EnderecoFields.tsx` | Endereço completo do condomínio, com preenchimento pelo CEP — as três telas usam este |
| `formatarDocumento()` | `web/src/lib/documento.ts` | CPF/CNPJ legível nas listagens |
| `SearchSelect` | `web/src/components/ui/search-select.tsx` | Select com busca por digitação (lista grande) |
| `Combobox` | `web/src/components/ui/combobox.tsx` | Campo com sugestões que **aceita valor fora da lista** (transportadora) |
| `TRANSPORTADORAS` | `web/src/lib/transportadoras.ts` | Transportadoras do Brasil + o tipo que amarra o leitor de código à lista |
| `prepararFoto()` / `capturarQuadro()` | `web/src/lib/imagem.ts` | Reduzir, recomprimir e medir nitidez de foto antes do upload |
| `formatarTelefone()` | `web/src/lib/telefone.ts` | Telefone legível nas listagens |
| `formatarCep()` | `web/src/lib/cep.ts` | CEP legível nas listagens |
| `fmtMoeda()` / `fmtData()` / `fmtCompetencia()` | `web/src/lib/formato.ts` | Dinheiro, data e competência em toda tela financeira |
| `mensagemErro()` | `web/src/lib/erros.ts` | Texto de erro para o usuário a partir de um `ApiError` |
| `asset()` | `web/src/lib/asset.ts` | Caminho de arquivo de `web/public/` — **o painel mora em `/app/`**, e `src="/x.png"` à mão cai na landing e dá 404 |
| `CheckboxField` | `web/src/components/ui/checkbox.tsx` | Caixa de seleção com o texto clicável |
| `SwitchField` | `web/src/components/ui/switch.tsx` | Liga/desliga de um recurso do cadastro — rótulo à esquerda, interruptor à direita, sem moldura |
| `rolagem-sem-barra` (utility CSS) | `web/src/styles.css` | Esconde a barra de rolagem sem tirar a rolagem — use com `max-md:` |
| `PageShell` | `web/src/components/ui/page-shell.tsx` | **Casca de toda tela do painel**: faixa âmbar no celular (título, busca, filtro, voltar), cabeçalho comum no desktop |
| `ListCard` / `ListCardStack` | `web/src/components/ui/list-card.tsx` | Registro de lista como card no celular (rótulo apagado sobre valor forte) |
| `SegmentedFilter` | `web/src/components/ui/segmented-filter.tsx` | Filtro segmentado sobre uma lista (Pendentes/Retirados) — mesma pele das abas |
| `ENCOMENDA_STATUS` / `TONE` | `web/src/components/encomendas/encomenda-status.ts` | Rótulo, cor e ícone de cada estado da encomenda — listagem e detalhe leem daqui |
| `SERIE_*` / `ESTADO_*` / `EIXO_*` | `web/src/lib/graficos.ts` | Cores, eixos e grade de todo gráfico — **nenhum hexadecimal na tela** |
| `Tabs` (`TRILHO_SEGMENTADO`) | `web/src/components/ui/tabs.tsx` | Abas de conteúdo; é aqui que mora a pele do controle segmentado |
| `DataTable` com `mobileCard` | `web/src/components/ui/data-table.tsx` | Lista que é card no celular e tabela no desktop |
| `EmptyState` / `StatCard` / `ConfirmDialog` / `SimpleSelect` | `web/src/components/ui/` | Estado vazio, indicador, confirmação e select |
| `OptionCard` / `ModuleToggle` / `ModuleReadonly` / `InfoPill` | `web/src/components/condominio/condominio-shared.tsx` | Telas de configurar condomínio (superadmin e administradora) |
| `AssinaturaCondominioPanel` / `WhatsappCondominioPanel` | `web/src/components/condominio/` | Abas "Assinatura" e "WhatsApp" de um condomínio, nas telas do superadmin e da administradora |
| `useAuthMe` / `useCondominioAtivo` / `useModuleEnabled` | `web/src/hooks/use-tenant-config.ts` | Usuário, condomínio ativo e módulos contratados |

Se você está prestes a copiar um trecho de outro arquivo, considere extrair a
peça e registrar aqui — é assim que esta tabela cresce.

### Git
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- **Branch**: `main` (produção), `develop` (desenvolvimento)
- **PR**: Squash merge

---

## 🔢 Versionamento — obrigatório em toda alteração

> **Quem mexe no sistema sobe a versão.** Sem exceção: back, front, migration,
> ajuste de estilo. É a versão que diz ao porteiro (e ao suporte) qual build
> está rodando naquele celular, e é ela que dispara a atualização automática.

Formato **MAIOR.RECURSO.CORREÇÃO** (`0.0.0`):

| Posição | Sobe quando | Exemplo |
|---|---|---|
| **MAIOR** (`1.0.0`) | Virada de versão do produto: marco grande, quebra de compatibilidade, mudança de rumo | Sair do beta; trocar o gateway de WhatsApp |
| **RECURSO** (`0.1.0`) | Funcionalidade grande nova | Módulo Vagas, Dashboard, relatórios, integração nova |
| **CORREÇÃO** (`0.0.1`) | Bug, ajuste visual, refino, texto, refactor | Modal cortado no celular, telefone salvo errado |

Ao subir a versão, **`RECURSO` zera `CORREÇÃO`** e **`MAIOR` zera as duas**
(`0.9.4` + recurso = `0.10.0`).

```bash
npm run versao correcao    # bug corrigido
npm run versao recurso     # funcionalidade grande
npm run versao maior       # virada de versão
npm run versao 1.2.3       # número exato
```

O script sobe o número **nos três `package.json`** (raiz, `web/` e `landing/`) —
eles precisam bater porque cada app é buildado a partir da própria pasta, e a
raiz é o que a API informa em `GET /api/health`.

**No mesmo commit da alteração**: subir a versão + descrever a mudança no
[CHANGELOG.md](CHANGELOG.md). Versão sem linha no changelog não diz nada a
quem for investigar um problema daqui a três meses.

### Como a atualização chega ao usuário

Ninguém precisa dar reload — nem no navegador, nem no PWA instalado:

1. `web/src/hooks/use-atualizacao.ts` pergunta ao servidor se há build novo a
   cada minuto, ao voltar ao primeiro plano e ao reconectar.
2. Achou: o service worker baixa a versão nova e ela fica pronta.
3. Aplica (recarrega) **em momento seguro** — na troca de tela, ou com o app
   ocioso e sem campo preenchido. Nunca no meio de um cadastro.
4. Enquanto espera, aparece um aviso com "Atualizar agora".
5. Depois de recarregar, um toast confirma: "Atualizado para a versão X".

Por isso o `vite.config.ts` usa `registerType: 'prompt'` — quem decide a hora de
recarregar é o app, não o service worker. Não troque para `autoUpdate`: o reload
passaria a acontecer no meio do que o porteiro estiver digitando.

---

## 🚫 Regras que DEVEM ser seguidas

1. **NUNCA** usar `synchronize: true` no TypeORM
2. **NUNCA** expor senhas ou tokens em logs, responses ou commits
3. **NUNCA** usar `confirm()` ou `alert()` nativos — usar Dialog do shadcn/ui
4. **NUNCA** usar emojis como ícones na UI — usar Lucide React
5. **NUNCA** enviar mensagens WhatsApp sem respeitar as regras anti-bloqueio
6. **NUNCA** deletar registros fisicamente — usar soft delete (`ativo = false`)
7. **NUNCA** retornar `senhaHash` em responses da API
8. **NUNCA** ignorar `tenant_id` em queries — sempre filtrar pelo tenant do usuário logado
9. **SEMPRE** validar DTOs com `class-validator` no backend
10. **SEMPRE** usar migrations SQL para alterações no schema
11. **SEMPRE** registrar ações críticas no `audit_log`
12. **SEMPRE** usar componentes shadcn/ui para elementos de interface
13. **SEMPRE** usar a fonte Poppins
14. **SEMPRE** suportar dark mode nos novos componentes
15. **SEMPRE** fazer loading states com Skeleton (nunca texto "Carregando...")
16. **SEMPRE** desenvolver mobile-first (estilos base = mobile, depois media queries para desktop)
17. **SEMPRE** usar os tamanhos padrão dos componentes shadcn — **NUNCA** forçar
    altura à mão (`h-12`, `min-h-[48px]`); se precisar destoar, use a variante
    de tamanho (`size="lg"`, `size="sm"`)
18. **SEMPRE** dar `aria-label` a botão que é só ícone
19. **SEMPRE** usar `Label` em campo de formulário, salvo campo auto-evidente
    (busca) — e aí com `aria-label`
20. **SEMPRE** tirar o tamanho de texto da escala (`txt-numero`, `txt-titulo`,
    `txt-secao`, `txt-subtitulo`, `txt-corpo`, `txt-apoio`, `txt-nota`,
    `eyebrow`) — **NUNCA** `text-sm`/`text-lg`/`md:text-xl` soltos nem
    `text-[13px]`. Ver "Escala tipográfica"
21. **NUNCA** usar gestos complexos (swipe, long-press) — usar botões explícitos
22. **SEMPRE** testar responsividade em viewport 375px (menor tela suportada)
23. **NUNCA** aninhar `Card` dentro de `Card` — bloco interno é chapado
    (`rounded-lg bg-muted`, sem borda e sem sombra). Ver "Hierarquia de superfícies"
24. **SEMPRE** dar `mobileCard` ao `DataTable` — lista de registros é card no
    celular e tabela no desktop; tabela nunca rola na horizontal

### Identidade visual
> Detalhe, exemplos e checklist: [web/src/components/ui](web/src/components/ui/CLAUDE.md)

24.1. **NUNCA** usar âmbar (`primary`) como decoração — ele é da **ação e do
    foco**. Aba selecionada, passo atual, ícone de card e borda de destaque se
    marcam por degrau de tom, não por cor de sinal
24.2. **NUNCA** escrever cor à mão (`#hex`, `bg-sky-500`) — inclusive em
    gráfico, onde as cores saem de `web/src/lib/graficos.ts`
24.3. **SEMPRE** usar o `Dialog` para qualquer sobreposição (formulário, câmera,
    espera) — overlay próprio sempre diverge em raio, rolagem e botão de fechar
24.4. **SEMPRE** usar `Tabs` (troca conteúdo) ou `SegmentedFilter` (filtra a
    mesma lista) — nunca desenhar um trilho de abas/filtros à mão
24.5. **SEMPRE** pôr ação de registro em botão de ícone (`acoes` do `ListCard`);
    botão largo no rodapé é para aviso, não para ação
24.6. **NUNCA** empilhar num gráfico o que não soma um todo real (subconjunto
    com o conjunto, contagens de datas diferentes), e não misturar fluxo com
    estoque no mesmo eixo

### Acesso e multitenant
25. **SEMPRE** perguntar quais perfis acessam uma funcionalidade nova, antes de
    implementar (ver "Regra de ouro para funcionalidade nova")
26. **NUNCA** ler `X-Tenant-Id` fora do `TenantScopeGuard` — nas rotas, só `@TenantId()`
27. **SEMPRE** validar id de outra entidade que venha no corpo com
    `assertRefDoTenant()` (`src/common/tenant-scope/tenant-ref.ts`)
28. **NUNCA** aceitar `tenantId` vindo do corpo da request — em `create()`, o
    `tenantId` vem **depois** do spread do DTO
29. **SEMPRE** rodar `npm run test:e2e` ao mexer em guard, role, rota nova ou escopo

### Dados de contato
30. **NUNCA** pedir `+55` ao usuário — telefone se digita `(32) 99999-9999`.
    No DTO, `@TelefoneE164()`; na tela, `PhoneInput`; na listagem,
    `formatarTelefone()`. O banco guarda **sempre** E.164
30.1. **NUNCA** pedir "só os números" num campo de CPF/CNPJ — a máscara é da
    tela. No DTO, `@DocumentoBrasileiro()`; na tela, `DocumentoInput`; na
    listagem, `formatarDocumento()`. O banco guarda **sempre** só dígitos
30.2. **NUNCA** escrever um campo de CEP à mão — no DTO, `@Cep()`; na tela,
    `CepInput`; na listagem, `formatarCep()`. Endereço de condomínio inteiro é
    `EnderecoFields`, que já traz a consulta pelo CEP

### Documentação viva
31. **SEMPRE** atualizar o `CLAUDE.md` do módulo ao alterá-lo (rotas, perfis,
    regras, campos). Doc desatualizada é pior que doc inexistente
32. **SEMPRE** atualizar a tabela "O que cada perfil faz" ao mudar um `@Roles`
33. **SEMPRE** criar o `CLAUDE.md` junto com o módulo novo — nunca "depois"

### Versionamento
34. **SEMPRE** subir a versão (`npm run versao correcao|recurso|maior`) na
    mesma alteração — bug é `CORREÇÃO`, funcionalidade grande é `RECURSO`,
    virada de produto é `MAIOR` (ver "Versionamento")
35. **SEMPRE** registrar a mudança no `CHANGELOG.md`, no commit da alteração
36. **NUNCA** editar a versão só em um dos `package.json` — use o script, que
    mantém raiz, `web/` e `landing/` no mesmo número

---

## 🔧 Comandos Úteis

```bash
# ---- Backend ----
npm run start:dev              # Dev server com hot reload
npm run build                  # Build de produção
npm test                       # Testes unitários
npm run test:e2e               # Testes end-to-end
npm run db:migrate             # Rodar migrations pendentes
npm run db:migrate:down        # Reverter última migration
npm run db:migrate:create nome # Criar nova migration
npm run seed:dev               # Popular banco com dados de teste
npm run versao correcao        # Sobe a versão (correcao | recurso | maior | X.Y.Z)

# ---- Frontend ----
cd web
npm run dev                    # Dev server Vite (porta 5173)
npm run build                  # Build de produção
npx shadcn@latest add [comp]  # Adicionar componente shadcn/ui

# ---- Docker (Dev) ----
docker compose up -d           # Sobe Postgres, Redis, MinIO, Adminer
docker compose down            # Para tudo
```

---

## 🔐 Variáveis de Ambiente Importantes

Veja `.env.example` para lista completa. As mais críticas:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão PostgreSQL |
| `REDIS_URL` | String de conexão Redis |
| `JWT_SECRET` | Segredo para assinar tokens JWT (min 16 chars) |
| `OPENWA_BASE_URL` | URL do gateway WhatsApp (vazio = envio desligado) |
| `OPENWA_API_KEY` | Chave do gateway |
| `WEBHOOK_BASE_URL` | URL pública da API, usada para registrar o webhook no gateway |
| `VITE_API_URL` | URL da API para o frontend |
| `OPENWA_TIMEOUT_MS` | Timeout de cada chamada ao gateway (padrão 15000) |
| `NOTIFICATION_CONCURRENCY` | Condomínios enviando em paralelo (padrão 15) |
| `WORKER_ENABLED` | `false` numa réplica que só atende HTTP |
| `OCR_BASE_URL` | Serviço de OCR de etiquetas (vazio = leitura desligada) |
| `OCR_TIMEOUT_MS` | Timeout de cada leitura de imagem (padrão 30000) |
| `CEP_TIMEOUT_MS` | Timeout da consulta de CEP (padrão 5000). Sem URL: BrasilAPI + ViaCEP |
| `PAYMENT_API_BASE_URL` | Gateway de cobrança da assinatura (vazio = cobrança desligada) |
| `PAYMENT_API_COMPANY_ID` | `X-Company-Id` — somos uma company só lá dentro |
| `PAYMENT_API_KEY` | Chave do gateway (`X-API-Key`) — o caminho principal de autenticação |
| `PAYMENT_API_EMAIL` / `PAYMENT_API_PASSWORD` | Usuário de integração (JWT), reserva para endpoints exclusivos de JWT |
| `PAYMENT_WEBHOOK_TOKEN` | Segredo do nosso webhook de pagamento (vazio = a rota recusa tudo) |
| `PAYMENT_BLOQUEIO_ATIVO` | Bloqueio por inadimplência. **Nasce `false`** — é o freio de mão |

> Não existe número remetente global: **o número é o da sessão do condomínio** no
> OpenWA. Também não há variável de provedor — o gateway é um só.
