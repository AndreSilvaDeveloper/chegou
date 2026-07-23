# Rodar em desenvolvimento (tudo em Docker)

Um comando sobe **banco + redis + minio + backend + frontend**, todos com **hot reload**.

```bash
docker compose up          # (add -d para rodar em segundo plano)
```

| Serviço | URL | Login |
|---|---|---|
| Frontend (Vite + HMR) | http://localhost:5173 | — |
| API (NestJS) | http://localhost:3000/api | — |
| Adminer (banco) | http://localhost:8081 | server `postgres` · user/senha `portaria` |
| MinIO (console) | http://localhost:9001 | `portaria` / `portaria123` |

O código é montado por bind mount: **salvar um arquivo recarrega sozinho** (o front dá
HMR, o back recompila via `nest --watch`). As **migrations** rodam automaticamente no start
da API.

## Primeiro uso

```bash
docker compose up -d                       # sobe tudo (na 1ª vez builda as imagens)
docker compose exec api npm run seed:dev   # cria usuários e dados de teste
```

Logins de teste (senha `senha123`):
- superadmin → `admin@portaria.app`
- síndico → `sindico@bela-vista.app`
- porteiro → `porteiro@bela-vista.app`

## Conflito de porta

Se você já roda o backend/front **fora** do Docker (portas 3000/5173 ocupadas), defina
outras portas ao subir:

```bash
API_PORT=3010 WEB_PORT=5174 docker compose up
```

(ou coloque `API_PORT=3010` / `WEB_PORT=5174` no `.env` da raiz). Isso muda só a porta no
host — o front continua falando com a API pela rede interna do Docker.

## Comandos do dia a dia

```bash
docker compose logs -f api          # logs do backend
docker compose logs -f web          # logs do front
docker compose exec api sh          # shell no container da API
docker compose exec api npm run db:migrate:down   # reverter última migration
docker compose down                 # para tudo (mantém os dados nos volumes)
docker compose down -v              # para tudo e APAGA os dados (banco/minio zerados)
```

Só a infra (rodando back/front fora do Docker):

```bash
docker compose up postgres redis minio adminer
```

## Mudou dependência (package.json)?

Rebuild a imagem correspondente:

```bash
docker compose up -d --build api    # ou: web
```

## Hot reload não dispara? (Windows/macOS)

O polling do watcher já vem ligado (`CHOKIDAR_USEPOLLING=true` nos containers). Se ainda
assim não recarregar, salve o arquivo de novo — em bind mounts o watcher pode ter uma
pequena latência.
