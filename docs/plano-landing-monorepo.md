# Plano — landing page + painel no mesmo domínio

> **Status: planejado, não implementado.** Este documento é o combinado de como
> a landing page entra no projeto. Nada aqui existe ainda no código.
>
> Quando a pasta `landing/` for criada, as seções "O app da landing" e
> "Decisões e armadilhas" viram `landing/CLAUDE.md` — é a convenção do projeto
> (doc de módulo mora ao lado do código e é carregada automaticamente). Este
> arquivo pode então virar só o histórico da decisão.

---

## 1. O que se quer

Um domínio só — `chegou.bellory.com.br` — servindo duas coisas:

| URL | Quem responde |
|---|---|
| `chegou.bellory.com.br/` | Landing page (marketing, SEO, conversão) |
| `chegou.bellory.com.br/app/...` | Painel (o Vite de hoje, com todas as rotas internas) |
| `chegou.bellory.com.br/login` | Atalho — redirect 301 para `/app/login` |
| `chegou.bellory.com.br/api/...` | API NestJS (como já é) |
| `chegou.bellory.com.br/fotos/...` | MinIO (como já é) |

**No DNS não muda nada.** Continua um registro A apontando para o servidor, e o
reverse proxy do host continua mandando tudo para `127.0.0.1:${APP_PORT}`. A
divisão acontece dentro da stack, no nginx interno (`deploy/nginx/app.conf`) —
que já faz exatamente isso hoje para `/api/` e `/fotos/`.

### Por que dois apps e não migrar tudo para Next.js

A alternativa avaliada foi levar o painel inteiro para Next.js e ter um app só.
Medição do painel na época da decisão (2026-07-30):

| | |
|---|---|
| Código do front | 18.690 linhas, 97 arquivos |
| Telas | 23 páginas + 31 componentes shadcn |
| Pontos de `react-router` a converter | 43 |
| Arquivos com API só-de-browser | 15 `document.`, 8 `window.`, 6 `localStorage`, 4 `navigator.` |
| Esforço estimado | 12–18 dias úteis (~3–4 semanas) |

O painel é **100% atrás de login e 100% client-side**: token no `localStorage`,
react-query buscando tudo no browser, câmera, canvas, `getUserMedia`. SSR e RSC
— que é o que se compra indo para o Next — não têm o que fazer ali. Pagaria-se
3 semanas e risco de regressão para chegar na mesma tela.

O item mais caro nem era o roteamento: era o **PWA**. O `registerType: 'prompt'`
existe de propósito para o service worker não recarregar no meio de um cadastro
do porteiro, e o `use-atualizacao.ts` (154 linhas) decide a hora segura de
aplicar. No Next isso se refaz na mão, com Serwist, e quebra silenciosamente.

Quem precisa de SSR é **só a landing**. Daí a decisão: dois apps, um repositório,
um deploy, um domínio.

---

## 2. Arquitetura alvo

```
                    Internet
                       │
                       ▼
        reverse proxy do host (TLS, chegou.bellory.com.br)
                       │
                       ▼  127.0.0.1:${APP_PORT}
        ┌──────────────────────────────┐
        │  proxy  (nginx interno)      │
        └──┬────────┬─────────┬────────┘
           │        │         │        └────────────┐
       /   │   /app │    /api │                     │ /fotos
           ▼        ▼         ▼                     ▼
       landing    web        api                  minio
      (Next/Astro) (SPA)   (NestJS)                (S3)
                             │
                    postgres · redis · ocr
```

O repositório passa a ser:

```
chegou/
├── landing/     ← NOVO: site público
├── web/         ← painel (Vite) — muda pouco, ver seção 4
├── src/         ← API NestJS — não muda nada
├── ocr/         ← serviço de OCR — não muda nada
├── deploy/      ← compose de produção + nginx
└── docs/
```

---

## 3. Roteamento no nginx

### Produção — `deploy/nginx/app.conf`

Os blocos `/api/` e `/fotos/` ficam **exatamente como estão**. O que muda é o
`location /` de hoje, que passa a ser da landing, e nasce o `/app/`:

```nginx
    # Painel (SPA Vite) — todas as rotas internas caem aqui
    location /app/ {
        proxy_pass http://web:80/;          # a barra final REMOVE o /app do caminho
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }

    # Atalho: a URL que as pessoas digitam e compartilham
    location = /login  { return 301 /app/login; }
    location = /app    { return 301 /app/; }

    # Landing page
    location / {
        proxy_pass http://landing:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    }
```

**A barra final do `proxy_pass` é a decisão central e precisa ser conferida no
primeiro deploy.** Com `http://web:80/` (com barra), o nginx tira o `/app` antes
de repassar: o container `web` recebe `/encomendas` e o `web/nginx.conf` atual
continua funcionando sem uma linha alterada. O `base: '/app/'` do Vite faz o
`index.html` pedir `/app/assets/...`, que volta pelo mesmo caminho e é
desprefixado de novo. Fecha.

A alternativa (sem a barra) entrega `/app/encomendas` ao container e exigiria
mudar o `root`/`try_files` do `web/nginx.conf`. Mais peças mexidas, mesmo
resultado — por isso a recomendação é a barra.

### Desenvolvimento

Hoje o `docker-compose.yml` da raiz **não tem proxy**: o Vite atende direto em
`localhost:5173` e faz proxy de `/api` para a API via `VITE_PROXY_TARGET`. Com a
landing entram duas opções:

| Opção | Como fica | Custo |
|---|---|---|
| **A — sem proxy no dev** | painel em `localhost:5173/app/`, landing em `localhost:3001` | zero, mas dev ≠ prod |
| **B — proxy também no dev** | um container nginx no compose de dev, tudo em `localhost:8090` | ~2h, dev espelha prod |

Recomendação: **começar pela A** (é suficiente para tocar a landing) e migrar
para a B antes do primeiro deploy, para o roteamento ser testado localmente e
não direto em produção.

---

## 4. O que muda no painel (`web/`)

Poucos arquivos, mas todos obrigatórios — meia parte de um dia:

| Arquivo | Mudança | Por quê |
|---|---|---|
| `web/vite.config.ts` | `base: '/app/'` | Faz o build referenciar `/app/assets/...` em vez de `/assets/...` |
| `web/src/main.tsx` | `<BrowserRouter basename="/app">` | Sem isso o react-router acha que está na raiz e todo link quebra |
| `web/vite.config.ts` (manifest PWA) | `start_url: '/app/'`, `scope: '/app/'` | Escopo do service worker (ver armadilhas) |
| `deploy/nginx/app.conf` | blocos da seção 3 | Roteamento |

### O que **não** muda

- **As chamadas de API.** O `client.ts` monta `${base}/api${path}` a partir de
  `VITE_API_URL`, que é vazio em produção (`web/Dockerfile`) — ou seja, o fetch
  sai como `/api/...`, absoluto a partir da raiz, e continua caindo no bloco
  `/api/` do nginx. O `base` do Vite não afeta `fetch`.
- **`web/nginx.conf`**, se a barra final do `proxy_pass` for usada (seção 3).
- **`web/Dockerfile`**, o build e o healthcheck `/healthz`.
- **A API, o OCR, o banco.** Nada no backend sabe que isso existe.

### O redirect da raiz que já foi feito

Em 0.20.0 a lista de encomendas saiu de `/` e virou `/encomendas`, e a raiz
ficou como `<Navigate to="/encomendas" replace />` para não quebrar bookmark nem
o PWA instalado. **Com o `basename="/app"` esse redirect passa a valer dentro do
painel**: `/app/` → `/app/encomendas`. É o comportamento desejado — a raiz do
domínio (`/`) já não pertence ao painel, é da landing.

---

## 5. O app da landing (`landing/`)

### Stack

**Next.js** (App Router) é a escolha default por ser o que você já quer usar e
por resolver SEO/OG/sitemap sem ginástica. **Astro** seria mais leve para um site
que é quase todo estático, mas adiciona uma terceira ferramenta ao projeto — só
vale se a landing crescer para blog/conteúdo.

Decisão a tomar na implementação; o roteamento da seção 3 é o mesmo para os dois
(qualquer um sobe HTTP numa porta e recebe `proxy_pass`).

### Estrutura sugerida

```
landing/
├── app/
│   ├── layout.tsx         # <html>, fontes, metadata base
│   ├── page.tsx           # a landing
│   ├── precos/page.tsx
│   ├── contato/page.tsx
│   └── sitemap.ts, robots.ts
├── components/
├── public/                # og-image, favicon PRÓPRIO (ver armadilhas)
├── Dockerfile             # build + runtime `next start` (ou estático)
├── Dockerfile.dev
└── CLAUDE.md              # ← seções 5 e 8 deste doc mudam de casa para cá
```

### Design: reaproveitar sem acoplar

A landing deve **parecer** o produto: mesma paleta (âmbar `#FFC72C` sobre
greige), mesma Poppins, mesma escala tipográfica. Mas ela não deve importar de
`web/src/` — são dois builds independentes, e um import cruzado transforma
qualquer refactor do painel em risco para o site de marketing.

O caminho barato: **copiar os tokens** (o bloco de `:root` de
`web/src/styles.css`) para o `landing/`. São ~60 linhas de CSS custom properties
que mudam raramente. Se um dia mudarem junto com frequência, aí sim vale extrair
um pacote `packages/tokens` — não antes.

O que a landing **não** herda: shadcn/ui, react-query, motion, Radix. Um site de
marketing não precisa disso, e cada um deles é peso de bundle que atrapalha
justamente a métrica que a landing existe para ganhar.

---

## 6. Docker

### Produção — `deploy/docker-compose.yml`

Um serviço novo, no molde do `web`:

```yaml
  landing:
    build:
      context: ../landing
      dockerfile: Dockerfile
    image: chegou-landing:local
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 5
```

E o `proxy` ganha `landing` no `depends_on`. O `deploy.sh` **não muda**: ele roda
`docker compose up -d --build --remove-orphans`, que já pega o serviço novo.

### Desenvolvimento — `docker-compose.yml` da raiz

Mesmo molde do `web` de dev, com bind mount e volume anônimo de `node_modules`.

> ⚠️ **Lembre do volume anônimo.** O `web` de dev usa `- /app/node_modules`, e
> foi exatamente isso que fez o `qrcode` sumir do container em 30/07/2026:
> dependência nova no `package.json` não chega ao volume antigo. Sempre que
> adicionar dependência em `landing/` ou `web/`:
> ```bash
> docker compose up -d --build --renew-anon-volumes landing
> ```

---

## 7. Ordem de implementação

Cada fase termina em algo testável. Não pular a 1 — é ela que prova o roteamento
antes de existir qualquer conteúdo para debugar junto.

| # | Fase | Entregável | Est. |
|---|---|---|---|
| 1 | **Prefixo do painel** — `base`, `basename`, `scope` do PWA, nginx com `/app/` e a landing ainda sendo um "hello world" | painel inteiro funcionando em `/app/...`, com PWA instalando no escopo novo | 0,5 d |
| 2 | **Esqueleto da landing** — Next/Astro, Dockerfile, entrada no compose de dev e de prod, tokens de cor e fonte | `/` servindo a landing, `/app/` o painel, no mesmo host | 1 d |
| 3 | **Conteúdo** — seções, copy, imagens, formulário de contato, OG/sitemap/robots | landing pronta para receber tráfego | (depende do conteúdo) |
| 4 | **Proxy no dev** (opção B da seção 3) | dev espelhando o roteamento de produção | 0,5 d |
| 5 | **Deploy** — primeiro `./deploy.sh` com os dois apps, conferindo a lista da seção 9 | no ar | 0,5 d |

**Total de infraestrutura: ~2,5 dias.** O conteúdo da landing é o que domina o
prazo, e é trabalho de design/copy, não de migração.

---

## 8. Decisões e armadilhas

**O escopo do service worker é o motivo de existir o prefixo `/app`.** A
alternativa — deixar o painel na raiz e listar os 15 prefixos dele no nginx
(`/login|/encomendas|/moradores|...`) — funciona, mas o escopo do SW é um
prefixo de caminho e, com as rotas espalhadas, o único possível seria `/`. O
service worker do painel passaria a controlar e cachear **a landing page**: você
publica uma mudança no site de marketing e ela não aparece para quem já abriu o
painel. É bug que só se manifesta depois, com cliente na frente. O `/app`
resolve por construção.

**Trocar o `scope` quebra o PWA já instalado.** O atalho na tela do celular
aponta para o `start_url` antigo (`/`), que passará a abrir a landing. Quem já
tem o app instalado precisa reinstalar pelo endereço novo. Antes de fazer isso
em produção, **levantar quantos aparelhos já têm o app instalado** e avisar os
condomínios. É a única mudança deste plano que é sentida pelo usuário final.

**Cada app tem o seu favicon e o seu manifest.** Hoje o painel serve
`/favicon.ico`, `/manifest.webmanifest`, `/icon-192.png` e `/apple-touch-icon.png`
na raiz. Com a landing na raiz, esses arquivos passam a ser **dela** — o painel
serve os dele sob `/app/`. Não é só estética: um `manifest.webmanifest` errado
na raiz faz o Chrome oferecer "instalar" a landing como se fosse o app.

**A landing não importa código de `web/`.** Dois builds independentes. Um import
cruzado faz qualquer refactor do painel virar risco para o site que gera lead.
Tokens de cor se **copiam**; extrair um pacote compartilhado só quando os dois
começarem a mudar juntos de verdade.

**`base` do Vite não afeta `fetch`.** O `client.ts` continua chamando `/api/...`
absoluto. Se um dia alguém "corrigir" isso para caminho relativo, as chamadas
viram `/app/api/...` e tudo quebra de uma vez.

**O dev não tem proxy hoje.** Enquanto a fase 4 não for feita, o roteamento
`/` vs `/app/` só existe em produção — ou seja, é testado direto lá. É aceitável
para a fase 1 e 2; não é aceitável como estado permanente.

---

## 9. Checklist de verificação (antes de considerar pronto)

Roteamento:
- [ ] `/` abre a landing
- [ ] `/app/` redireciona para `/app/encomendas`
- [ ] `/login` redireciona 301 para `/app/login`
- [ ] `/app/encomendas/nova`, `/app/moradores`, `/app/admin/etiquetas` abrem (rota profunda, não só a raiz do painel)
- [ ] **Recarregar com F5 numa rota profunda do painel** — é o teste que pega `try_files`/fallback errado
- [ ] `/api/health` responde
- [ ] Foto de encomenda carrega (`/fotos/...`)
- [ ] `/cadastro/:token` (autocadastro público) abre — está dentro de `/app/`

Painel:
- [ ] Login → destino certo por papel (síndico/porteiro em `/app/encomendas`, admin em `/app/meus-condominios`, superadmin em `/app/admin`)
- [ ] Assets com hash carregam (sem 404 no console)
- [ ] Câmera/scanner funcionam (exigem HTTPS — conferir no domínio real, não em IP)
- [ ] Upload de foto de etiqueta funciona
- [ ] PWA instala, e o atalho abre `/app/`
- [ ] Atualização automática funciona: subir versão, esperar o aviso, aplicar

Landing:
- [ ] Lighthouse/PageSpeed em mobile
- [ ] OG image aparece ao colar o link no WhatsApp
- [ ] `sitemap.xml` e `robots.txt` respondem
- [ ] Service worker do painel **não** está controlando a landing
      (DevTools → Application → Service Workers, com a landing aberta)

---

## 10. Resumo do esforço

| Item | Estimativa |
|---|---|
| Infra (fases 1, 2, 4, 5) | ~2,5 dias úteis |
| Conteúdo da landing (fase 3) | depende de design/copy |
| **Comparação: migrar tudo para Next.js** | **12–18 dias úteis, sem ganho para o painel** |
