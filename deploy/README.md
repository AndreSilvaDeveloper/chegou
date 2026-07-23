# Deploy da Chegou — servidor próprio, build no servidor, tudo em Docker

Fluxo simples, sem GitHub Actions e sem registry:

1. Você **commita** e faz push no GitHub (da sua máquina).
2. No servidor, roda **um comando**: `./deploy.sh`.
3. Ele faz `git pull`, **rebuilda** o front e o back e recria os containers.
   As **migrations do banco** rodam sozinhas no start da API.

TLS automático com **nginx + certbot**. Fotos no **MinIO** (self-hosted). Tudo em Docker.

```
   você ──git push──▶ GitHub
                         │
   servidor: ./deploy.sh ─┤ git pull → docker compose up -d --build
                         ▼
  Internet ──▶ proxy (nginx + TLS 443) ─┬─ /      ▶ web   (SPA React)
                                        ├─ /api   ▶ api   (NestJS + migrations no start)
                                        └─ /fotos ▶ minio (bucket público)
                                          api ▶ postgres · redis · minio
```

Tudo sobe com **um** arquivo: `deploy/docker-compose.yml`.

---

## Pré-requisitos

- Um servidor (VPS) com **Docker** e o plugin **docker compose v2** (`docker compose version`).
- Um **subdomínio** (ex.: `chegou.bellory.com.br`).
- Portas **80** e **443** liberadas no firewall.
- Como o build do frontend acontece no servidor, tenha **≥ 1 GB de RAM livre**. Em VPS
  pequena, crie swap antes:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

> As portas do Postgres/Redis/MinIO **não** ficam expostas na internet — só a 80/443 do proxy.

---

## Parte 1 — DNS (uma vez)

Crie um registro **A** apontando o subdomínio para o **IP do servidor**:

```
Tipo: A    Nome: chegou    Valor: <IP-do-servidor>    TTL: 300
```

Confirme (pode levar alguns minutos a propagar):

```bash
dig +short chegou.bellory.com.br     # deve retornar o IP do servidor
```

---

## Parte 2 — Preparar o servidor (uma vez)

Entre no servidor por SSH:

```bash
git clone https://github.com/SEU-USUARIO/chegou.git
cd chegou/deploy
cp .env.example .env
nano .env
```

Preencha o `.env` (gere segredos fortes):

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 20   # MINIO_ROOT_PASSWORD
```

Obrigatórios: `DOMAIN`, `LETSENCRYPT_EMAIL`, `POSTGRES_PASSWORD`, `JWT_SECRET`,
`MINIO_ROOT_PASSWORD`, `SUPERADMIN_PASSWORD` e `WHATSAPP_FROM_NUMBER`
(E.164, ex.: `+14155238886`).

Dê permissão de execução aos scripts:

```bash
chmod +x deploy.sh init-letsencrypt.sh backup.sh
```

---

## Parte 3 — Primeira subida + certificado (uma vez)

Ainda em `chegou/deploy`, rode:

```bash
./init-letsencrypt.sh
```

Ele builda as imagens, cria um certificado temporário, sobe a stack, pede o certificado
real ao Let's Encrypt e recarrega o nginx. Ao final, **https://chegou.bellory.com.br** abre.

> Depurando emissão? Coloque `CERTBOT_STAGING=1` no `.env`, rode, confirme o fluxo, depois
> volte para `0` e rode de novo.

### Criar o superadmin

```bash
docker compose exec api node scripts/seed-prod.js
```

Cria o usuário com `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` do `.env`. Já dá pra logar.

---

## Parte 4 — O deploy do dia a dia

Sempre que você terminar uma alteração:

1. Na **sua máquina**: `git add -A && git commit -m "..." && git push`
2. No **servidor**:
   ```bash
   cd ~/chegou/deploy && ./deploy.sh
   ```

O `deploy.sh` faz `git pull`, rebuilda e recria os containers. Front, back e banco
(migrations) atualizam juntos. É esse o "um comando".

> Quer 100% automático? Dá pra deixar um cron no servidor rodando `./deploy.sh` a cada X
> minutos (ele só reconstrói o que mudou), ou disparar por um webhook — mas o fluxo manual
> acima é o mais previsível.

---

## Parte 5 — WhatsApp (Twilio)

No painel do Twilio, aponte o webhook de entrada para:

```
https://chegou.bellory.com.br/api/webhooks/whatsapp/twilio
```

Preencha `TWILIO_*` no `.env` e mantenha `WHATSAPP_WEBHOOK_VERIFY=true` em produção.
Depois de editar o `.env`: `docker compose up -d api`.

---

## Operação

```bash
docker compose ps                 # o que está rodando
docker compose logs -f api        # logs do backend
docker compose logs -f proxy      # logs do nginx/TLS
docker compose up -d api          # reiniciar só a API (após editar .env)
docker compose restart proxy      # recarregar o nginx (após mudar o template)
./backup.sh                       # backup do Postgres → deploy/backups/
```

Cron de backup diário às 3h (`crontab -e`):

```
0 3 * * * cd /root/chegou/deploy && ./backup.sh >> backups/cron.log 2>&1
```

Restaurar um backup:

```bash
gunzip -c backups/chegou-AAAAMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U portaria -d portaria
```

---

## Como cada peça se atualiza

- **Frontend / Backend**: `./deploy.sh` rebuilda a partir do código e recria os containers.
- **Banco de dados**: o container `api` roda `npm run db:migrate` no start (idempotente) —
  toda migration nova em `db/migrations/` é aplicada automaticamente no deploy.
- **Certificado TLS**: o container `certbot` renova a cada 12h; o `proxy` recarrega a cada 6h.

---

## Troubleshooting

| Sintoma | O que fazer |
|---|---|
| Build do front falha / servidor trava | Falta RAM. Crie swap (ver Pré-requisitos). |
| `proxy` reiniciando / 502 | Rode `./init-letsencrypt.sh` (garante o certificado). Veja `docker compose logs proxy`. |
| Cert não emite | DNS ainda não aponta pro servidor, ou porta 80 bloqueada. Cheque `dig` e o firewall. |
| `api` não sobe | `docker compose logs api`. Falta variável no `.env` (ex.: `WHATSAPP_FROM_NUMBER` em E.164) ou o Postgres ainda subindo. |
| `git pull` reclama de mudança local | No servidor não edite arquivos versionados (só o `.env`, que é ignorado). `git status` para ver. |
| Foto não abre | Confira `docker compose logs minio-init` (bucket criado/publicado) e `STORAGE_PUBLIC_URL` no `.env`. |
