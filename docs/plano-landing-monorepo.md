# Plano — landing page + painel no mesmo domínio

> **Status: implementado.** A landing está em `landing/`, o painel mudou para
> `/app/`, e os dois compose têm o roteamento. Este documento virou **registro**:
> a decisão de não migrar para Next.js (§ 1) e o que mudou entre o combinado e a
> implementação (§ 11).
>
> **A regra viva mora em [`landing/CLAUDE.md`](../landing/CLAUDE.md)** — é lá
> que se confere ao mexer no código. A lista de verificação (§ 9) continua
> valendo e **ainda não foi rodada em produção**.

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

> ⚠️ **Esta decisão foi revista depois de implementada.** A landing começou em
> Vite + React, como planejado abaixo, e **hoje é Next.js**. O texto original
> fica porque o motivo da virada só se entende contra ele. O porquê está no
> § 11; a regra viva, em [`landing/CLAUDE.md`](../landing/CLAUDE.md).

<details>
<summary>O que estava combinado (Vite + React)</summary>

**Nem Next nem Astro: Vite + React**, a mesma stack do painel.

A landing foi escrita antes desta decisão ser fechada, e ficou boa — uma página
só, sem rota, sem dado dinâmico, sem formulário com servidor. O que se compraria
com o Next (SSR, RSC, roteamento) não tem o que fazer aqui; o que se pagaria é
uma terceira ferramenta no projeto e um processo Node em produção, num servidor
que já roda postgres, redis, minio e o OCR.

O SEO de que ela precisa — `<title>`, description, Open Graph — está no
`index.html`, servido estático. Um crawler não pede mais que isso de uma página
só. **Se um dia virar blog**, aí a conversa muda e o Astro passa a ser a escolha
natural.

</details>

### Estrutura

Ver [`landing/CLAUDE.md`](../landing/CLAUDE.md) — o texto todo mora em
`src/lib/conteudo.ts`, e o CSS de cada componente é importado por ele mesmo.

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
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/healthz"]
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

---

## 11. O que mudou entre o combinado e a implementação

**A stack começou em Vite e terminou em Next.js.** O § 5 argumentava contra o
Next e o argumento estava certo *para o que estava sendo pesado* — SSR, RSC e
roteamento, nenhum dos três necessário numa página só. O que ficou de fora da
conta foi o resto: quem lê a landing não é só um navegador.

O que passou a valer a ferramenta a mais e o processo Node:

- **`next/font` auto-hospeda Poppins e JetBrains Mono.** Some a ida e volta a
  `fonts.googleapis.com` no caminho crítico, e o `size-adjust` gerado mata o
  pulo de layout na troca de fonte — metade de um CLS ruim, na página cuja
  única função é converter visitante.
- **O `<head>` vira dado, não markup.** Canonical, Open Graph e JSON-LD saem do
  mesmo `conteudo.ts` que a copy (`src/lib/site.ts`). Escrito à mão no
  `index.html`, o preço do structured data divergiria do preço da página no
  primeiro ajuste de texto — e é o buscador que penaliza isso.
- **`sitemap.xml`, `robots.txt` e `/llms.txt` são gerados no build.** O último é
  o que move o ponteiro hoje: quando alguém pergunta a um assistente "qual
  sistema de portaria com aviso por WhatsApp?", a resposta sai do que ele
  conseguiu ler. Servir a nossa copy em texto puro é mais barato que torcer para
  ele extrair sentido de `div` aninhada.
- **O HTML nasce completo.** As peças com `'use client'` continuam
  pré-renderizadas: `'use client'` diz onde o JS *hidrata*, não onde o HTML
  nasce. Um agente que não executa script lê a página inteira.

O custo previsto no § 5 foi pago, e é honesto registrá-lo: **existe um processo
Node em produção** (`next start` sobre o build `standalone`, ~40 MB de imagem).
`output: 'export'` chegou a ser considerado para evitá-lo, mas levaria junto o
`/llms.txt` e qualquer rota futura — e era exatamente por eles que a migração
aconteceu.

Duas armadilhas que a migração trouxe, e como foram fechadas:

- **`useState` que lê `window` quebra o build.** O `use-tema` inicializava o
  estado com `window.matchMedia(...)`; no Vite isso só rodava no navegador, e no
  Next roda no build (`ReferenceError: window is not defined`). Hoje ele começa
  em `false` — o único valor que o servidor pode produzir — e se corrige no
  primeiro efeito.
- **O tema piscava.** Com o HTML igual para todo mundo, quem escolheu o tema
  *contrário* ao do sistema via a cor errada até o React hidratar. Resolvido por
  um script bloqueante no `<head>` (`src/lib/tema.ts`), que aplica `data-theme`
  antes da primeira pintura — com `suppressHydrationWarning` no `<html>`, já que
  a divergência de atributo passa a ser deliberada.

**Fase 4 (proxy no dev) foi feita junto, não depois.** O plano sugeria começar
sem proxy em dev e migrar antes do deploy. Como a landing já estava pronta, a
fase 4 virou pré-requisito da 5: sem ela, a **barra final do `proxy_pass`** — a
decisão central do § 3 — só seria testada em produção. `nginx-dev.conf` espelha
`deploy/nginx/app.conf`; a diferença é só o alvo (dev server em vez de build
pronto, com os cabeçalhos de WebSocket que mantêm o HMR vivo).

**Nasceu um redirect que o plano não previa: `/cadastro/`.** O QR de autocadastro
montava a URL como `${origin}/cadastro/${token}` — com o painel em `/app/`, todo
QR **já impresso e colado no elevador** levaria o morador à landing. Duas
correções, porque são dois problemas:

- QRs novos: `QrAutocadastroDialog` passou a usar `import.meta.env.BASE_URL`;
- QRs antigos: `location /cadastro/ { return 301 /app$request_uri; }` nos dois
  nginx. Papel não se atualiza.

**O `navigateFallbackDenylist` do service worker ganhou `/^\/(?!app\/)/`.** O
`scope: '/app/'` já impede o SW de *controlar* a landing, mas o fallback de
navegação é outra coisa: sem a negativa, ele responderia o `index.html` do
painel para uma URL do site. É o mesmo bug que o § 8 descreve, por um caminho
que o plano não tinha mapeado.

**A tabela de preços da landing estava desatualizada** e foi corrigida junto:
ela publicava o corte antigo em 50 apartamentos e prometia à administradora um
desconto por volume que não existe mais (hoje ela tem tabela própria, R$ 1,99).
Não é assunto de infraestrutura, mas era o tipo de erro que só aparece na
primeira fatura do cliente.
