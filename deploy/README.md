# Deploy da Chegou — servidor próprio, atrás do seu reverse proxy

Fluxo simples, sem GitHub Actions e sem registry:

1. Você **commita** e faz push no GitHub (da sua máquina).
2. No servidor, roda **um comando**: `./deploy.sh`.
3. Ele faz `git pull`, **rebuilda** o front e o back e recria os containers.
   As **migrations do banco** rodam sozinhas no start da API.

A stack sobe toda em Docker e escuta numa **porta local** (`127.0.0.1:8090`). O **TLS e o
domínio** ficam no reverse proxy que **já existe no seu servidor** (o mesmo que serve seus
outros apps) — ele encaminha `chegou.bellory.com.br` → `127.0.0.1:8090`.

```
                                   ┌─ (outros apps: bellory_api, n8n, evolution...)
  Internet ──▶ proxy do HOST ──────┤
   (TLS 443)  nginx/caddy/traefik  └─ chegou.bellory.com.br ─▶ 127.0.0.1:8090
                                                                  │
                        proxy interno (nginx :80) ─┬─ /      ▶ web   (SPA React)
                                                   ├─ /api   ▶ api   (NestJS + migrations)
                                                   └─ /fotos ▶ minio (bucket público)
                                                     api ▶ postgres · redis · minio
```

Postgres, Redis e MinIO **não** publicam porta nenhuma — só o proxy interno, e mesmo assim
só no `127.0.0.1`. Nada da Chegou conflita com seus outros serviços.

---

## Pré-requisitos

- Servidor com **Docker** + **docker compose v2** (`docker compose version`).
- Um reverse proxy já rodando no host (você tem — é ele que ocupa a 80/443). Normalmente
  **nginx**, **caddy** ou **traefik**.
- Subdomínio **chegou.bellory.com.br** apontando pro IP do servidor (registro **A**).
- Como o front é buildado no servidor, tenha **≥ 1 GB de RAM livre** (crie swap se a VPS for pequena).

---

## Parte 1 — DNS (uma vez)

Registro **A**: `chegou` → IP do servidor. Confirme:

```bash
dig +short chegou.bellory.com.br     # deve retornar o IP do servidor
```

---

## Parte 2 — Subir a stack (uma vez)

```bash
git clone https://github.com/SEU-USUARIO/chegou.git /opt/chegou/chegou   # ou onde preferir
cd /opt/chegou/chegou/deploy
cp .env.example .env
nano .env          # preencha os segredos (veja abaixo)
./deploy.sh        # builda e sobe tudo
```

Segredos do `.env` (gere fortes):

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 20   # MINIO_ROOT_PASSWORD
```

Obrigatórios: `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `MINIO_ROOT_PASSWORD`,
`SUPERADMIN_PASSWORD`, `WHATSAPP_FROM_NUMBER` (E.164). Se a porta **8090** já estiver em uso,
troque `APP_PORT` no `.env`.

Confira que subiu e está escutando na porta local:

```bash
docker compose ps
curl -I http://127.0.0.1:8090        # deve responder (200/302) — é a Chegou
```

### Criar o superadmin

```bash
docker compose exec api node scripts/seed-prod.js
```

---

## Parte 3 — Ligar o domínio no proxy do host (uma vez)

Descubra qual proxy segura a 443:

```bash
sudo ss -tlnp '( sport = :443 )'
```

Use o bloco do proxy que você tem:

### nginx (no host)

Crie `/etc/nginx/sites-available/chegou.bellory.com.br`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name chegou.bellory.com.br;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative e emita o certificado (o certbot do host edita esse vhost e liga o HTTPS):

```bash
sudo ln -s /etc/nginx/sites-available/chegou.bellory.com.br /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d chegou.bellory.com.br
```

### Caddy (no host)

No `Caddyfile`:

```caddy
chegou.bellory.com.br {
    reverse_proxy 127.0.0.1:8090
    request_body {
        max_size 20MB
    }
}
```

```bash
sudo systemctl reload caddy   # Caddy emite o TLS sozinho
```

### Traefik

Aponte um router/serviço para `http://127.0.0.1:8090` (ou coloque o container `proxy` na
rede do Traefik e use labels). Se usa Traefik, me avise que eu te passo os labels prontos.

Pronto: **https://chegou.bellory.com.br** no ar, TLS gerenciado pelo proxy do host.

---

## Parte 4 — O deploy do dia a dia

1. Na **sua máquina**: `git add -A && git commit -m "..." && git push`
2. No **servidor**: `cd /opt/chegou/chegou/deploy && ./deploy.sh`

O `deploy.sh` faz `git pull`, rebuilda e recria os containers. Front, back e migrations
atualizam juntos. Não precisa mexer no proxy do host de novo.

---

## Parte 5 — WhatsApp (Twilio)

Webhook de entrada no Twilio:

```
https://chegou.bellory.com.br/api/webhooks/whatsapp/twilio
```

Preencha `TWILIO_*` no `.env`, mantenha `WHATSAPP_WEBHOOK_VERIFY=true` e rode
`docker compose up -d api`.

---

## Operação

```bash
docker compose ps
docker compose logs -f api
docker compose up -d api          # reiniciar só a API (após editar .env)
docker compose restart proxy      # recarregar o nginx interno (após mudar nginx/app.conf)
./backup.sh                       # backup do Postgres → deploy/backups/
```

Cron de backup diário às 3h (`crontab -e`):

```
0 3 * * * cd /opt/chegou/chegou/deploy && ./backup.sh >> backups/cron.log 2>&1
```

Restaurar:

```bash
gunzip -c backups/chegou-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U portaria -d portaria
```

---

## Como cada peça se atualiza

- **Frontend / Backend**: `./deploy.sh` rebuilda a partir do código e recria os containers.
- **Banco de dados**: o container `api` roda `npm run db:migrate` no start (idempotente) —
  toda migration nova em `db/migrations/` é aplicada automaticamente no deploy.
- **TLS**: gerenciado pelo reverse proxy do host (certbot/caddy que você já usa).

---

## Troubleshooting

| Sintoma | O que fazer |
|---|---|
| `bind: address already in use` (80/443) | Modelo antigo. Esta versão **não** usa 80/443 — só `127.0.0.1:${APP_PORT}`. Rode `git pull && ./deploy.sh`. |
| `APP_PORT` já em uso | Troque `APP_PORT` no `.env` e no vhost do host; `docker compose up -d`. |
| 502 no domínio | `curl -I http://127.0.0.1:8090` no servidor. Se falhar, veja `docker compose logs proxy api`. Se responder, o problema é o vhost do host. |
| `api` não sobe | `docker compose logs api`. Falta variável no `.env` (ex.: `WHATSAPP_FROM_NUMBER` em E.164). |
| Foto não abre | `docker compose logs minio-init` e confira `STORAGE_PUBLIC_URL` no `.env`. |
| Upload falha por tamanho | Aumente `client_max_body_size` no vhost do host (nginx) — o interno já está em 20m. |
