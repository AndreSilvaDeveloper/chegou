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
│  Deploy: Vercel                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS (REST API)
┌────────────────────────▼────────────────────────────────────────┐
│                     BACKEND (API)                               │
│  NestJS + TypeORM + Passport JWT                                │
│  Deploy: Render / Railway (Docker)                              │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  PostgreSQL │    Redis     │   S3/MinIO   │  WhatsApp API       │
│  (dados)    │  (BullMQ)    │  (fotos)     │  (não-oficial)      │
└─────────────┴──────────────┴──────────────┴─────────────────────┘
```

### Multitenancy
- **Modelo**: Database compartilhado, schema compartilhado
- **Isolamento**: Toda tabela possui `tenant_id` (FK para `tenants`)
- **Exceções**: `superadmin` tem `tenant_id = NULL`, audit_log e whatsapp_messages permitem NULL

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

### Infraestrutura
| Serviço | Uso |
|---|---|
| Vercel | Deploy do frontend |
| Render / Railway | Deploy do backend (Docker) |
| Cloudflare R2 / MinIO | Storage de fotos |
| Redis (Render Key-Value) | Filas BullMQ |

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
├── web/                          # Frontend React
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

### Entidades Existentes
| Tabela | Descrição |
|---|---|
| `tenants` | Condomínios (multi-tenant) |
| `users` | Usuários do painel (superadmin, síndico, admin, porteiro) |
| `apartamentos` | Unidades do condomínio (bloco + número → identificador) |
| `moradores` | Moradores com telefone WhatsApp |
| `encomendas` | Encomendas recebidas na portaria |
| `whatsapp_messages` | Histórico de mensagens WhatsApp (in/out) |
| `audit_log` | Log de auditoria de ações |

### Novas Entidades (a implementar)
| Tabela | Descrição |
|---|---|
| `funcionarios` | Equipe do condomínio (zelador, faxineiro, etc.) |
| `vagas` | Vagas de garagem/estacionamento |
| `vagas_locacao` | Locações avulsas de vagas com cobrança |
| `notificacoes` | Fila unificada de notificações (encomenda, cobrança, aviso) |
| `avisos` | Avisos gerais do condomínio para moradores |

### Roles do Sistema
| Role | Acesso | tenant_id | Login de Teste (Seed) |
|---|---|---|---|
| `superadmin` | Plataforma inteira | NULL | `admin@portaria.app` / `senha123` |
| `sindico` | Admin do condomínio | obrigatório | `sindico@bela-vista.app` / `senha123` |
| `admin` | Gestão do condomínio | obrigatório | N/A |
| `porteiro` | Operação de portaria | obrigatório | `porteiro@bela-vista.app` / `senha123` |

---

## 🔌 Módulos de Domínio

### Encomendas (Core)
- Registro de recebimento pelo porteiro
- Geração de código de retirada (4 dígitos, único entre ativas)
- Notificação automática via WhatsApp
- Retirada por código ou documento
- Cancelamento com motivo
- Status: `aguardando → notificado → retirada | cancelada | devolvida`

### WhatsApp Gateway
- **Interface**: `WhatsappGateway` com adapters por provedor
- **Adapters implementados**: Twilio (completo), Z-API (stub)
- **API não-oficial**: Foco em Z-API ou Evolution API
- **Filas BullMQ**: `notify-morador`, `confirmar-retirada`
- **Fallback**: SMS via Twilio quando WhatsApp falha
- **Idempotência**: Chave única por tenant + tipo de notificação
- **Inbound**: Processamento de respostas do morador ("código", "cheguei")

### Vagas de Garagem (novo)
- CRUD de vagas (tipo: carro/moto, número, localização)
- Vinculação de vaga ao apartamento
- Locação avulsa com valor e vencimento
- Disparo de boleto/cobrança via WhatsApp

### Equipe / Funcionários (novo)
- Registro de funcionários do condomínio
- Categorias: porteiro, zelador, faxineiro, jardineiro, etc.
- Escala de trabalho (horários/dias)
- Sem acesso ao sistema (diferente de User)

### Fila de Notificações (novo)
- Fila unificada para todos os tipos de disparo
- Tipos: encomenda, cobrança, aviso geral
- Anti-blocking para API não-oficial (ver regras abaixo)

---

## 🛡️ Regras Anti-Bloqueio WhatsApp (API Não-Oficial)

> **CRÍTICO**: Estas regras DEVEM ser seguidas rigorosamente para evitar
> bloqueio do número WhatsApp do condomínio.

### Controle de Taxa (Rate Limiting)
1. **Delay entre mensagens**: Intervalo aleatório de **8 a 30 segundos** entre cada envio
2. **Lotes**: Máximo **15 mensagens por lote**, pausa de **3 a 8 minutos** entre lotes
3. **Limite diário**: Máximo configurável por número (padrão: **100/dia**, escalar gradualmente)
4. **Warm-up de número novo**: Iniciar com 10-20/dia, aumentar 10 a cada 3 dias

### Janela de Envio
5. **Horário comercial**: Enviar apenas entre **8h e 21h** (horário local, configurável por tenant)
6. **Sem envio em massa simultâneo**: Fila serializada por número remetente

### Conteúdo
7. **Variação de texto**: Adicionar variações sutis nas mensagens (nome do morador, horário, etc.)
8. **Personalização**: Toda mensagem deve ter dados específicos do destinatário
9. **Sem links suspeitos**: Evitar encurtadores de URL

### Monitoramento e Saúde
10. **Taxa de erro**: Se > 10% de falhas na última hora, pausar envios por 30 minutos
11. **Circuit breaker**: Após 3 falhas consecutivas, pausar por 5 minutos e notificar admin
12. **Logs completos**: Registrar todo envio/falha em `whatsapp_messages`

### Implementação Técnica (BullMQ)
```typescript
// Configuração da fila de notificações
{
  limiter: {
    max: 1,                    // 1 job por vez
    duration: 15_000,          // mínimo 15s entre jobs
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },  // 1min, 2min, 4min
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
}
```

---

## 🎨 Design System (Frontend)

### Princípios
1. **Premium e moderno**: Glassmorphism, gradientes suaves, micro-animações
2. **Mobile-first**: O porteiro usa no celular na portaria
3. **Dark mode**: Suporte com toggle (preferência salva em localStorage)
4. **Consistência**: Todos os componentes via shadcn/ui
5. **Acessibilidade**: ARIA labels, contraste adequado, foco visível

### Paleta de Cores
```
Primary:    Azul profundo (#2563EB → #1D4ED8)
Secondary:  Slate (#64748B)
Success:    Emerald (#10B981)
Warning:    Amber (#F59E0B)
Danger:     Red (#EF4444)
Background: Slate-50 (light) / Slate-950 (dark)
```

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

> **REGRA FUNDAMENTAL**: O sistema é usado principalmente por **porteiros** que são
> frequentemente **pessoas mais velhas** e acessam pelo **celular na portaria**.
> Toda decisão de UI deve priorizar simplicidade e facilidade de uso.

### Mobile-First
1. **Abordagem**: Desenvolver primeiro para mobile, depois adaptar para desktop
2. **Breakpoints**: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px` (TailwindCSS padrão)
3. **Layout mobile**: Uma coluna, conteúdo empilhado verticalmente
4. **Layout desktop**: Sidebar fixa + conteúdo expandido
5. **Touch targets**: Mínimo **48x48px** para botões e links (acima do padrão 44px)
6. **Espaçamento generoso**: `gap-3` mínimo entre elementos interativos
7. **FAB (Floating Action Button)**: Ação principal acessível no canto inferior direito no mobile

### Acessibilidade para Usuários Mais Velhos
8. **Fonte mínima**: `text-base` (16px) para texto, `text-lg` (18px) para labels importantes
9. **Contraste alto**: Ratio mínimo 4.5:1 (WCAG AA) — testar com ferramentas de contraste
10. **Botões grandes**: Classes `py-3 px-6` mínimo para ações primárias no mobile
11. **Ícones com labels**: SEMPRE acompanhar ícones com texto descritivo (nunca ícone sozinho)
12. **Feedback visual claro**: States de loading, sucesso e erro devem ser óbvios e grandes
13. **Formulários simples**: Um campo por linha no mobile, labels sempre visíveis (nunca placeholder-only)
14. **Navegação simples**: Máximo 7 itens visíveis na sidebar, agrupados logicamente
15. **Confirmação de ações destrutivas**: Sempre usar Dialog com texto claro e botões grandes
16. **Sem gestos complexos**: Evitar swipe, long-press ou double-tap — usar botões explícitos
17. **Scroll vertical apenas**: Evitar scroll horizontal em qualquer viewport

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

### Git
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
- **Branch**: `main` (produção), `develop` (desenvolvimento)
- **PR**: Squash merge

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
17. **SEMPRE** usar touch targets de no mínimo 48x48px em botões e links
18. **SEMPRE** acompanhar ícones com texto descritivo
19. **NUNCA** usar placeholder como substituto de label em formulários
20. **NUNCA** usar gestos complexos (swipe, long-press) — usar botões explícitos
21. **SEMPRE** testar responsividade em viewport 375px (menor tela suportada)

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
| `WHATSAPP_PROVIDER` | Provedor: `twilio`, `zapi`, `evolution` |
| `WHATSAPP_FROM_NUMBER` | Número remetente E.164 |
| `VITE_API_URL` | URL da API para o frontend (Vercel) |
