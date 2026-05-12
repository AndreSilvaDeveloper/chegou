# Deploy Guide

Arquitetura de produção:

```
[ Vercel (web) ]  ──>  [ Render: NestJS API (Docker) ]  ──>  [ Render: Postgres ]
                              │                          ──>  [ Render: Key Value (Redis/BullMQ) ]
                              └──>  [ Cloudflare R2 / S3 (opcional) ]   ← fotos
                              └──>  [ Twilio WhatsApp/SMS ]
```

---

## 1. Backend — Render (Blueprint)

O repo tem um `render.yaml` que cria tudo de uma vez: o web service (Docker), o Postgres e o Key Value (Redis).

### 1.1. Criar o Blueprint

1. https://dashboard.render.com → **New +** → **Blueprint**
2. Conecte o GitHub e escolha o repo `chegou`
3. A Render lê o `render.yaml` e mostra: `portaria-api` (web), `portaria-db` (Postgres), `portaria-redis` (Key Value) → **Apply**
4. Ele já liga `DATABASE_URL`, `REDIS_URL` e gera o `JWT_SECRET` sozinho. As migrations rodam no `preDeployCommand` (`npm run db:migrate`) a cada deploy.

### 1.2. Variáveis que você precisa preencher (Render → portaria-api → Environment)

```
WHATSAPP_FROM_NUMBER=+14155238886          # nº do Twilio Sandbox (ou seu nº Meta em prod)
WEBHOOK_BASE_URL=https://portaria-api.onrender.com   # a URL pública que a Render te der
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...                       # rotacionado — não o que apareceu em chat
TWILIO_WHATSAPP_FROM=+14155238886
```

Opcionais (só se for usar upload de foto — ex. Cloudflare R2):
```
STORAGE_BUCKET=portaria-fotos
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_PUBLIC_URL=https://<seu-dominio-de-fotos>
```
Sem isso o app sobe normal — só o upload de foto fica indisponível (a tela de nova encomenda funciona sem foto).

### 1.3. Pegar a URL e atualizar o webhook

Após o primeiro deploy, a Render dá uma URL tipo `https://portaria-api.onrender.com`.
- Atualize `WEBHOOK_BASE_URL` com ela (e redeploy)
- No Twilio (Sandbox settings ou Sender em prod), aponte "When a message comes in" para `https://portaria-api.onrender.com/api/webhooks/whatsapp/twilio`
- Rode o seed do superadmin uma vez: Render → portaria-api → Shell → `npm run seed:dev` (em prod real, use um seed enxuto)

### Atenção ao free tier da Render

- O web service **dorme após 15 min sem requests** → primeira request depois disso demora ~50s (cold start). Enquanto dorme, jobs da fila (BullMQ) não processam — só acordam na próxima request. Workaround: um ping a cada ~10 min (UptimeRobot / cron-job.org, ambos free) mantém o serviço acordado.
- O **Postgres free expira ~30 dias** após criado. Pra algo de verdade, faça upgrade (US$7/mês) ou migre pra Neon (free, sem expirar) trocando só o `DATABASE_URL`.

> Alternativa paga e sem cold start: Railway Hobby (~US$5/mês) — o `railway.json` na raiz já está pronto pra isso.

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
VITE_API_URL = https://portaria-api.onrender.com
```

> Sem barra no final. Re-deploy depois de adicionar.

---

## 3. Storage de fotos

MinIO local funciona em dev. Em prod use:

- **Cloudflare R2** (recomendado, sem egress fee, S3-compat)
- AWS S3
- Backblaze B2
- Digital Ocean Spaces

Crie um bucket `portaria-fotos`, gere access keys, configure CORS permitindo o domínio do Vercel, e cole as vars `STORAGE_*` no painel da Render.

---

## 4. Twilio em produção

1. **Sair do sandbox**: você precisa de um número WhatsApp **aprovado pela Meta** (via Twilio "Senders"). Processo demora dias.
2. **Templates aprovados**: cada template (`encomenda_chegou`, `retirada_confirmada`, `lembrete_codigo`, `sem_encomenda_pendente`) precisa ser submetido na Twilio Content Builder e aprovado pela Meta.
3. **Webhook URL**: no Twilio Sender → "WhatsApp Inbound URL": `https://portaria-api.onrender.com/api/webhooks/whatsapp/twilio`
4. **Assinatura**: mantenha `WHATSAPP_WEBHOOK_VERIFY=true` em prod (a Twilio assina os webhooks).

---

## 5. Migração de dados (primeira subida)

As migrations rodam no `preDeployCommand` da Render a cada deploy. Depois, rode o seed manual pra criar o superadmin (Render → portaria-api → Shell):

```bash
npm run seed:dev
```

> Em produção real, use um script de seed enxuto que crie só o superadmin + condomínio piloto, não os dados de teste.

---

## 6. Custos estimados (produção piloto)

| Item | Mensal |
|---|---|
| Render (free: web + Postgres + Key Value) | $0 (Postgres expira ~30d; depois ~$7) |
| Vercel (Hobby) | $0 |
| Cloudflare R2 | $0 até 10GB/mês |
| Twilio WhatsApp (custo por conversa iniciada) | ~$0.005–0.020 por conversa |
| Twilio número Brasil | ~$1.15/mês |
| **Total** | **~$15–25/mês start** |

---

## 7. Checklist pré-go-live

- [ ] Auth Token Twilio rotacionado (sem nenhum valor que tenha aparecido em chat/log)
- [ ] `JWT_SECRET` gerado aleatório, mínimo 32 chars
- [ ] Backup automático do Postgres habilitado (ou migrado pra Neon antes dos 30 dias do free)
- [ ] Templates Meta aprovados (espera ~1-7 dias)
- [ ] Domínio próprio configurado (Vercel + Render com SSL automático)
- [ ] Tests passando: `npm test && npm run test:e2e`
- [ ] Webhook do Twilio apontado pra URL da Render (não mais ngrok)
- [ ] `WHATSAPP_SANDBOX_MODE=false` em produção
