# Deploy Guide

Arquitetura de produção:

```
[ Vercel (web) ]  ──>  [ Railway: NestJS API ]  ──>  [ Railway: Postgres ]
                              │                  ──>  [ Railway: Redis (BullMQ) ]
                              └──>  [ Cloudflare R2 / AWS S3 / Backblaze B2 ]   ← fotos
                              └──>  [ Twilio WhatsApp/SMS ]
```

---

## 1. Backend — Railway

### 1.1. Subir Postgres + Redis no Railway

1. https://railway.app → New Project → "Provision PostgreSQL"
2. Mesmo projeto → "+ New" → "Database" → "Add Redis"
3. Aguarde ambos subirem. Anote `DATABASE_URL` e `REDIS_URL` (são gerados automaticamente como variáveis do projeto).

### 1.2. Deploy do código

```bash
# Na raiz do projeto (não no /web)
railway login
railway link            # vincula ao projeto criado acima
railway up              # builda e deploya o Dockerfile
```

OU configure GitHub: New → "Deploy from GitHub repo" → escolha o repo, set **Root Directory = "/"**.

### 1.3. Variáveis de ambiente (Settings → Variables)

Cole tudo isso (substituindo os valores `<...>`):

```
NODE_ENV=production
PORT=3000

DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

JWT_SECRET=<gere 32+ chars: openssl rand -hex 32>
JWT_EXPIRES_IN=12h
BCRYPT_ROUNDS=12

WHATSAPP_PROVIDER=twilio
WHATSAPP_FROM_NUMBER=<seu número aprovado pela Meta, ex +5511...>
WHATSAPP_SANDBOX_MODE=false
WHATSAPP_WEBHOOK_VERIFY=true
WEBHOOK_BASE_URL=https://<seu-app>.up.railway.app

TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=<rotacionado, não o que vazou no dev>
TWILIO_WHATSAPP_FROM=<mesmo de WHATSAPP_FROM_NUMBER>
TWILIO_SMS_FROM=<número Twilio comprado pra SMS, opcional>
TWILIO_TEMPLATE_ENCOMENDA_CHEGOU=HX...
TWILIO_TEMPLATE_RETIRADA_CONFIRMADA=HX...

STORAGE_BUCKET=portaria-fotos
STORAGE_REGION=auto
STORAGE_ENDPOINT=<URL S3-compat — ex Cloudflare R2: https://<account>.r2.cloudflarestorage.com>
STORAGE_ACCESS_KEY=<...>
STORAGE_SECRET_KEY=<...>
STORAGE_PUBLIC_URL=<URL pública do bucket, ex https://fotos.seudominio.com>
```

> O `npm run db:migrate` roda automaticamente no startCommand do `railway.json` — não precisa rodar à mão.

### 1.4. Domínio público

Railway → Settings → Networking → "Generate Domain" → você terá algo como `portaria-prod.up.railway.app`. Atualize `WEBHOOK_BASE_URL` com ele.

---

## 2. Frontend — Vercel

### 2.1. Deploy

```bash
cd web
vercel login
vercel             # primeira vez: confirma configurações
vercel --prod      # subir versão de produção
```

OU pela UI: New Project → Import Git Repo → **Root Directory = "web"** → Framework: Vite.

### 2.2. Variável de ambiente

Vercel → Project Settings → Environment Variables:

```
VITE_API_URL = https://portaria-prod.up.railway.app
```

> Sem barra no final. Re-deploy depois de adicionar.

---

## 3. Storage de fotos

MinIO local funciona em dev. Em prod use:

- **Cloudflare R2** (recomendado, sem egress fee, S3-compat)
- AWS S3
- Backblaze B2
- Digital Ocean Spaces

Crie um bucket `portaria-fotos`, gere access keys, configure CORS permitindo o domínio do Vercel, e cole no Railway.

---

## 4. Twilio em produção

1. **Sair do sandbox**: você precisa de um número WhatsApp **aprovado pela Meta** (via Twilio "Senders"). Processo demora dias.
2. **Templates aprovados**: cada template (`encomenda_chegou`, `retirada_confirmada`, `lembrete_codigo`, `sem_encomenda_pendente`) precisa ser submetido na Twilio Content Builder e aprovado pela Meta.
3. **Webhook URL**: no Twilio Sender → "WhatsApp Inbound URL": `https://portaria-prod.up.railway.app/api/webhooks/whatsapp/twilio`
4. **Assinatura**: mantenha `WHATSAPP_WEBHOOK_VERIFY=true` em prod (a Twilio assina os webhooks).

---

## 5. Migração de dados (primeira subida)

As migrations rodam no startup do Railway. Depois, rode o seed manual pra criar o superadmin:

```bash
railway run npm run seed:dev
```

> Em produção real, use um script de seed enxuto que crie só o superadmin + condomínio piloto, não os dados de teste.

---

## 6. Custos estimados (produção piloto)

| Item | Mensal |
|---|---|
| Railway (Hobby plan + Postgres + Redis) | ~$10–15 |
| Vercel (Hobby) | $0 |
| Cloudflare R2 | $0 até 10GB/mês |
| Twilio WhatsApp (custo por conversa iniciada) | ~$0.005–0.020 por conversa |
| Twilio número Brasil | ~$1.15/mês |
| **Total** | **~$15–25/mês start** |

---

## 7. Checklist pré-go-live

- [ ] Auth Token Twilio rotacionado (sem nenhum valor que tenha aparecido em chat/log)
- [ ] `JWT_SECRET` gerado aleatório, mínimo 32 chars
- [ ] Backup automático do Postgres habilitado no Railway
- [ ] Templates Meta aprovados (espera ~1-7 dias)
- [ ] Domínio próprio configurado (Vercel + Railway com SSL automático)
- [ ] Tests passando: `npm test && npm run test:e2e`
- [ ] Webhook do Twilio apontado pra URL do Railway (não mais ngrok)
- [ ] `WHATSAPP_SANDBOX_MODE=false` em produção
