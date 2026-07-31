# Landing — CONDO avisa

Site público do produto. **Projeto separado do painel** (`web/`), de propósito:
o porteiro não deve baixar o marketing junto com a ferramenta de trabalho.

```bash
npm install
npm run dev      # http://localhost:5174  (o painel usa a 5173)
npm run build    # tsc + vite build -> dist/
npm run check    # só os tipos
```

Mesma arquitetura do painel — React + TypeScript + Vite, alias `@/` — mas sem
PWA, sem service worker, sem react-query e sem roteador: é uma página só.

## Como o código está organizado

```
src/
├── main.tsx                # entrada; a ORDEM dos imports de CSS importa (leia lá)
├── App.tsx                 # a ordem em que a página argumenta, e nada mais
├── lib/
│   ├── conteudo.ts         # TODO o texto da página
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

## Duas regras que não são óbvias

**1. A ordem do CSS no bundle é a ordem dos imports em `main.tsx`.**
`styles/index.css` (tokens, reset, escala) precisa vir antes de qualquer
componente, e `styles/movimento.css` depois de todos — ele desliga animações
com `!important` e tem de vencer o CSS de componente. Está comentado no arquivo.

**2. O texto mora em `lib/conteudo.ts`, não no markup.**
Revisar a copy inteira não deve exigir abrir um `.tsx`. O `**destaque**` do
conteúdo vira `<strong>` pelo componente `ui/Texto`.

## Design system

A paleta, a escala tipográfica e as texturas vêm **verbatim** de
`web/src/styles.css`. Esta página não inventa marca: aplica a que já existe.

Ao mexer no tema do painel, espelhe `src/styles/tokens.css` — os valores estão
na mesma ordem do arquivo original. O único acréscimo é `--fs-display`, um
degrau acima de `txt-numero`, que o painel não precisa.

## Antes de publicar

- [ ] Trocar `MARCA.email` em `lib/conteudo.ts` — hoje é um placeholder.
- [ ] Servir `dist/` como estático (o `deploy/` ainda não tem entrada para ele).
