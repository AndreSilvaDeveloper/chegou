# Landing — CONDO avisa

Site público do produto. **Projeto separado do painel** (`web/`), de propósito:
o porteiro não deve baixar o marketing junto com a ferramenta de trabalho.

```bash
npm install
npm run dev      # http://localhost:5174  (o painel usa a 5173)
npm run build    # next build -> .next/ (standalone)
npm run check    # só os tipos
```

**Next.js 16 (App Router) + React 19 + TypeScript**, alias `@/` para `src/`.
Sem PWA, sem service worker, sem react-query, sem Tailwind e sem shadcn: é uma
página só, com CSS próprio. O painel continua em Vite — são dois builds
independentes, e nenhum importa do outro.

## Por que Next aqui, se o painel é Vite

A landing começou em Vite e migrou. O que o Next entrega aqui **não é SSR** — a
página é estática, pré-renderizada no build:

| Ganho | Onde está |
|---|---|
| Fontes auto-hospedadas (sem ida a `fonts.googleapis.com`, sem pulo de layout) | `next/font` em `app/layout.tsx` |
| `<head>`, Open Graph e JSON-LD gerados **da copy** | `src/lib/site.ts` |
| `sitemap.xml` e `robots.txt` gerados no build | `app/sitemap.ts`, `app/robots.ts` |
| `/llms.txt` — a página em texto puro, para agente de IA | `app/llms.txt/route.ts` |

O raciocínio completo, inclusive o custo aceito (um processo Node em produção),
está em [docs/plano-landing-monorepo.md § 11](../docs/plano-landing-monorepo.md).

> **`'use client'` diz onde o JS hidrata, não onde o HTML nasce.** Os
> componentes interativos continuam pré-renderizados: quem lê a página sem
> executar script — um crawler, um agente de IA — recebe o texto inteiro.

## Onde ela vive: a raiz do domínio

Um domínio, dois apps. Quem divide é o nginx interno da stack:

| URL | Quem responde |
|---|---|
| `/` | **esta landing** |
| `/app/...` | o painel (`web/`) |
| `/login` | redirect 301 para `/app/login` |
| `/cadastro/:token` | redirect 301 para `/app/cadastro/:token` |
| `/api/...` · `/fotos/...` | API e MinIO, como sempre |

O painel ganhou o prefixo `/app` por causa do **escopo do service worker**: ele
é um prefixo de caminho, e com o painel na raiz o único escopo possível seria
`/` — o SW do painel passaria a controlar e cachear **esta página**. Publicar
uma mudança no marketing e ela não aparecer para quem já abriu o painel é bug
que só se manifesta depois, com cliente na frente.

Os arquivos são `deploy/nginx/app.conf` (produção) e `nginx-dev.conf` (dev). Os
dois têm as mesmas regras de caminho, de propósito.

> **A barra final do `proxy_pass` é o contrário aqui.** O painel usa
> `proxy_pass http://web:80/` **com** barra, para o `/app` ser removido antes de
> repassar. A landing usa `http://landing:3000` **sem** barra: o Next precisa
> receber o caminho como o visitante pediu, senão `/_next/...` não resolve.

> **O redirect de `/cadastro/`** existe para o QR de autocadastro já impresso e
> colado no elevador. Os novos QRs já nascem com `/app/` (o
> `QrAutocadastroDialog` usa `import.meta.env.BASE_URL`), mas papel não se
> atualiza.

## Docker

| Arquivo | Para quê |
|---|---|
| `Dockerfile` | build + `next start` sobre o `standalone` — é o que roda em produção |
| `Dockerfile.dev` | `next dev`, usado pelo compose da raiz |

**Há um processo Node em produção** — ao contrário do painel, que é nginx com
pasta estática. `output: 'standalone'` é o que mantém a conta baixa: empacota o
`server.js` e só as dependências realmente usadas, em vez de copiar
`node_modules` inteiro. O container ouve na **3000** e responde `/healthz`.

> ⚠️ **Volume anônimo em dev.** O compose usa `- /app/node_modules` e
> `- /app/.next`, e dependência nova no `package.json` **não** chega ao volume
> antigo. Depois de instalar algo aqui:
> ```bash
> docker compose up -d --build --renew-anon-volumes landing
> ```

### `NEXT_PUBLIC_SITE_URL` entra no **build**

A URL canônica vai para o `<link rel="canonical">`, o Open Graph e o
`sitemap.xml` — tudo assado no build. Por isso ela é `ARG` no `Dockerfile` e vem
do `DOMAIN` da stack, não de um valor fixo no código: canônica errada é a forma
mais rápida de o Google indexar o ambiente errado.

## Como o código está organizado

```
app/                        # App Router — só o que o Next exige
├── layout.tsx              # <head>, fontes, JSON-LD, script de tema
├── page.tsx                # a ordem em que a página argumenta, e nada mais
├── robots.ts · sitemap.ts  # gerados no build
├── llms.txt/route.ts       # a página em texto puro, para agente de IA
└── healthz/route.ts        # o que o healthcheck do container pergunta
src/
├── lib/
│   ├── conteudo.ts         # TODO o texto da página
│   ├── site.ts             # o que existe para MÁQUINAS (head, JSON-LD, llms)
│   ├── tema.ts             # a chave e o script de tema (o servidor também usa)
│   └── css.ts              # cn() e vars() para propriedades customizadas
├── hooks/                  # um comportamento por arquivo
├── styles/                 # tokens, reset, escala, layout, movimento
└── components/
    ├── marca/              # o símbolo SVG e o wordmark
    ├── ui/                 # peças reaproveitadas (Botao, Cartao, Faixa…)
    ├── layout/             # topo, menu, separador, rodapé
    ├── hero/               # a cena e as camadas de fundo
    └── secoes/             # uma seção da página por arquivo
```

**O CSS de cada componente é importado pelo próprio componente**, ao lado dele.
Apagar um componente leva o estilo dele junto — que é o principal motivo de não
existir mais uma folha única.

## Quatro regras que não são óbvias

**1. O CSS do layout vem ANTES do CSS de componente — e não dá para inverter.**
O Next injeta o CSS de `app/layout.tsx` primeiro e o de cada componente em
chunk próprio, depois. No Vite era o contrário (o `main.tsx` importava
`movimento.css` por último, e ele vencia por ordem de cascata); a migração
inverteu isso **em silêncio**, porque as regras com `!important` continuaram
vencendo e só as outras passaram a perder.

Foi assim que o bloco `prefers-reduced-motion` quebrou em produção: a animação
parava (`animation: none !important` vence sempre), mas as regras de **pose
estática** — `.pilha`, `.caixa`, `.forma`, `.separador__*` — perdiam para o CSS
do componente e deixavam os elementos presos no primeiro quadro da animação
recém-desligada. O sintoma era ~2400px de rolagem vazia em "Como funciona".

Por isso todo seletor daquele bloco começa com **`html`**: sobe a
especificidade de (0,1,0) para (0,1,1) e vence independente da ordem do bundle.
Regra nova ali dentro mantém o prefixo. Tokens e reset (`index.css`) continuam
bem servidos pela ordem do import, porque ninguém compete com eles.

**2. O texto mora em `lib/conteudo.ts`, não no markup.**
Revisar a copy inteira não deve exigir abrir um `.tsx`. O `**destaque**` do
conteúdo vira `<strong>` pelo componente `ui/Texto`. E como o `<head>`, o
JSON-LD e o `/llms.txt` saem de lá, **revisar a copy revisa os três junto**.

**3. Nada de `window` fora de efeito — e `typeof window` não é a solução.**
O código de componente roda no build, onde `window` não existe. Um
`useState(() => window.matchMedia(...))` passa no `tsc` e quebra o `next build`
com `ReferenceError` — foi assim que o `use-tema` quebrou.

**A armadilha é o conserto errado**, que já custou um bug em produção:

```ts
// ERRADO — parece defensivo, quebra a hidratação
useState(() => typeof window !== 'undefined' && matchMedia(q).matches)
```

O guard evita o `ReferenceError`, então o build passa e o `tsc` fica quieto.
Mas o servidor gera o HTML com `false` e o **primeiro** render do cliente
devolve o valor real. Quando os dois discordam, a hidratação falha inteira
(React #418) e o React **descarta o HTML do servidor e regenera a árvore** —
sintoma: erro no console e comportamento que só aparece em algumas máquinas,
porque depende da preferência/viewport de quem abre. Foi o que aconteceu com
`use-movimento-reduzido`, `use-media-query` e a constante `TEM_SCROLL_TIMELINE`
do `TituloFlutuante` (essa via `typeof CSS`).

O certo: **estado inicial igual ao do servidor** (normalmente `false`) e a
leitura do navegador dentro do `useEffect` — inclusive a leitura inicial, não
só o listener de `change`. Vale para qualquer capacidade que só o navegador
sabe responder: `matchMedia`, `CSS.supports`, `navigator`, `localStorage`.

**4. O tema é aplicado antes da primeira pintura, por um script inline.**
`src/lib/tema.ts` gera um script bloqueante que o `layout` injeta no `<head>`.
Sem ele, quem escolheu o tema *contrário* ao do sistema vê a cor errada até o
React hidratar. É também por isso que o `<html>` tem `suppressHydrationWarning`:
o atributo `data-theme` muda antes da hidratação, e isso é deliberado.

## Design system

A paleta, a escala tipográfica e as texturas vêm **verbatim** de
`web/src/styles.css`. Esta página não inventa marca: aplica a que já existe.

Ao mexer no tema do painel, espelhe `src/styles/tokens.css` — os valores estão
na mesma ordem do arquivo original. O único acréscimo é `--fs-display`, um
degrau acima de `txt-numero`, que o painel não precisa.

## O preço publicado é o preço cobrado

`PRECO.faixas` em `lib/conteudo.ts` espelha `assinatura_faixas` do banco
(migration 028). **As duas precisam andar juntas**: publicar uma faixa que o
sistema não cobra é o cliente descobrindo a diferença na primeira fatura.

| Onde | Hoje |
|---|---|
| Condomínio | 3,99 até 100 · 3,49 de 101 a 200 · 2,99 acima de 200 |
| Administradora | **1,99**, valor único sobre a carteira somada |

A administradora tem **tabela própria**, não desconto por volume — a landing já
disse o contrário, e prometia 3,49 a quem paga 1,99. Ao mexer no preço, mexa nos
dois lugares e confira [Assinaturas](../src/modules/assinaturas/CLAUDE.md).

> O preço também sai daqui para o `Offer` do JSON-LD e para o `/llms.txt`
> (`lib/site.ts`). Um número divergente entre página e structured data o
> buscador penaliza — por isso ele é lido de `PRECO`, nunca redigitado.

## Ao alterar esta pasta

- [ ] Mudou preço no sistema → **atualize `PRECO` aqui** (e vice-versa).
- [ ] Dependência nova → suba com `--renew-anon-volumes` (acima).
- [ ] Rota nova (ex.: `/precos`) → crie `app/precos/page.tsx`, **acrescente ao
      `app/sitemap.ts`** (ele não descobre rota sozinho) e confira que ela não
      colide com `/app`, `/api`, `/fotos` ou `/cadastro`.
- [ ] Leu `window`, `document` ou `localStorage`? Só dentro de `useEffect`.
- [ ] `npm run check` e `npm run build` antes de subir — o `build` é quem pega
      o acesso a `window` na renderização.

## Antes de publicar

- [ ] **Trocar `MARCA.email` em `lib/conteudo.ts`** — ainda é placeholder
      (`contato@condoavisa.com.br`). Ele vai para o rodapé (onde agora aparece
      escrito, sob a descrição da marca), para o JSON-LD (`Organization.email`)
      e para o `/llms.txt`.
- [ ] **Preencher `RODAPE.social`** em `lib/conteudo.ts` — as URLs estão vazias.
      O rodapé só desenha o ícone de quem tem `href`, então hoje a fileira não
      aparece e o canto fica com `RODAPE.assinatura`. Rede nova precisa do
      ícone correspondente em `ui/Icone.tsx`.
- [x] ~~Revisar `PERFIS`: a copy do porteiro vendia "botão grande, letra
      grande", premissa que **saiu do produto**~~ — corrigido em `PERFIS` e em
      `DUVIDAS` ("quanto tempo o porteiro leva para aprender"), que repetia a
      mesma promessa. Ver "Mobile-First & Acessibilidade" no
      [CLAUDE.md da raiz](../CLAUDE.md).
- [ ] Conferir a lista de verificação de roteamento em
      [docs/plano-landing-monorepo.md](../docs/plano-landing-monorepo.md).
