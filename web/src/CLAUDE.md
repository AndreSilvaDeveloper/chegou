# Frontend — painel web

React + Vite + TailwindCSS + shadcn/ui. Quem mais usa é o **porteiro**, no
celular, em pé na portaria — é por isso que tudo aqui é mobile-first. Os
tamanhos (texto e controle) são os **padrões do shadcn/ui**: o projeto já teve
uma escala aumentada para público mais velho, e essa premissa saiu.

## Estrutura

```
web/src/
├── api/client.ts       # fetch + token + X-Tenant-Id + ApiError
├── api/types.ts        # tipos espelhando as respostas da API
├── components/         # componentes de negócio
│   ├── ui/             # shadcn + peças próprias (FormDialog, EmptyState, StatCard…)
│   ├── apartamentos/   # vagas que pertencem à unidade
│   ├── vagas/          # diálogos e painéis do módulo Vagas
│   └── whatsapp/       # cards da conexão
├── hooks/              # use-tenant-config, use-theme, use-mobile, use-debounce…
├── lib/                # utils (cn), erros (mensagemErro), formato (moeda/data)
├── pages/              # uma por rota
├── App.tsx             # rotas + ProtectedRoute
└── components/Layout.tsx  # sidebar, menu por perfil, condomínio ativo
```

## Acesso — três lugares que precisam concordar

1. **Rota** (`App.tsx`): `<ProtectedRoute allowedRoles={[...]} requiresModule="...">`
2. **Menu** (`Layout.tsx` → `NAV_ITEMS`): mesmos `roles` e `modulo`
3. **API**: `@Roles(...)` no controller

Menu com perfil a mais que a rota = usuário vê o item e toma 403. Rota com
perfil a mais que a API = tela carrega vazia com erro.

### Condomínio ativo

- Síndico e porteiro: sempre o do vínculo.
- **Administradora**: escolhe em `/meus-condominios`; o id fica no localStorage e
  o `api` manda em `X-Tenant-Id` a cada request.
- **Abrir `/meus-condominios/:id` entra naquele condomínio.** A tela reaproveita
  os managers com `basePath=""`, que usam as rotas normais do condomínio; por
  isso ela só monta o conteúdo depois que o `:id` virou o ativo. Renderizar
  junto com a troca mostraria dado do condomínio anterior — **efeito de filho
  roda antes do efeito do pai**.
- Sem condomínio escolhido, o `ProtectedRoute` manda a administradora para a
  carteira. Só rota marcada com `semCondominio` escapa disso.
- Trocar de condomínio (`useTrocarCondominio`) **limpa o cache do react-query** —
  mostrar dado de um condomínio sob o nome de outro é pior que recarregar.

### Uma tela para dois perfis

`/assinatura` serve síndico e administradora: a pergunta é a mesma ("quanto eu
pago?"), muda o endpoint. Quem escolhe é o hook `useMinhaAssinatura()`
(`hooks/use-assinatura.ts`), pelo `role` do `useAuthMe()`. A rota é
`semCondominio` porque a conta da administradora é a da **carteira** — sem isso o
`ProtectedRoute` a mandaria escolher um condomínio que não muda a resposta. No
menu ela aparece duas vezes (grupos diferentes por perfil), filtrada por `roles`.

O **mesmo hook** alimenta o ponto de aviso de vencimento no menu
(`alertaAssinatura` no `NAV_ITEMS`). É uma query só de propósito: com duas, o
ponto do menu e a faixa da tela poderiam discordar sobre o mesmo vencimento.
Ela fica desligada para superadmin e porteiro, que não têm conta a pagar — os
endpoints responderiam 403.

### Uma tela, dois poderes

`SuperAdminTenant` e `MeuCondominio` configuram o mesmo condomínio. O que muda é
**o que cada perfil salva**, não a aparência — por isso as peças
(`OptionCard`, `ModuleToggle`, `ModuleReadonly`, `InfoPill`, `TIPO_META`) moram
em `components/condominio/condominio-shared.tsx`, e não copiadas nas duas.

Na tela da administradora, plano, `ativo` e os módulos aparecem **de leitura**,
com o motivo. Some-los faria o cliente achar que Vagas não existe e abrir
chamado; mostrá-los editáveis quebraria a regra (ver módulo Administradoras).

As duas telas têm **sete abas**, e as duas últimas são painéis inteiros
compartilhados, na mesma pasta:

| Aba | Painel | Superadmin | Administradora |
|---|---|---|---|
| Assinatura | `AssinaturaCondominioPanel` | edita preço especial e vencimento (`podeEditar`) | só leitura |
| WhatsApp | `WhatsappCondominioPanel` | edita, sem as travas anti-bloqueio | edita, com as travas do condomínio |

O que troca o endpoint é `podeEditar` (assinatura) e `basePath` (WhatsApp) —
`''` fala com as rotas do condomínio da sessão, `/admin/tenants/:id` com as da
plataforma. É o mesmo mecanismo de `ApartamentosManager` e `MoradoresManager`.

No celular as sete abas ficam 2 por linha (`grid-cols-2 sm:grid-cols-4
lg:grid-cols-7`): a aba não encolhe para caber tudo numa fita.

## Padrões de tela

| Situação | Use |
|---|---|
| Carregando | `Skeleton` (nunca o texto "Carregando…") |
| Lista vazia | `EmptyState` com ação |
| Lista de registros | `DataTable` com `mobileCard` — card no celular, tabela no desktop (ver abaixo) |
| Um registro como card | `ListCard` (`components/ui/list-card.tsx`) |
| Formulário | `FormDialog` (`components/ui/form-dialog.tsx`) |
| Ação destrutiva | `ConfirmDialog` (nunca `confirm()`) |
| Indicador numérico | `StatCard` |
| Escolha de sim/não numa linha | `CheckboxField` (caixa + texto clicável). `Switch` é para liga/desliga que vale na hora |
| Select | `SimpleSelect` |
| Select com lista grande | `SearchSelect` (busca por digitação; use `onSearchChange` para buscar no servidor) |
| Campo com sugestões, mas que aceita o que for digitado | `Combobox` (ver abaixo) |
| Telefone | `PhoneInput` — digita `(32) 99999-9999`, entrega E.164. **Nunca peça `+55`** |
| Telefone em listagem | `formatarTelefone()` de `@/lib/telefone` |
| Foto que vai subir para o servidor | `prepararFoto()` de `@/lib/imagem` (ver abaixo) |
| Erro de request | `toast.error(mensagemErro(err, 'Não foi possível …'))` |
| Dinheiro, data, competência | `fmtMoeda` / `fmtData` / `fmtCompetencia` de `@/lib/formato` |

Regras fixas: mobile-first (base = celular, `sm:`/`md:` amplia), tamanhos padrão
do shadcn (não force `h-12`/`min-h-[48px]`), `aria-label` em botão só de ícone,
`Label` no campo de formulário, ícones só do Lucide, dark mode em tudo, testar em
375px.

### Tamanho de texto: use a escala, nunca `text-sm`

A escala vive em `styles.css` (bloco "ESCALA TIPOGRÁFICA"). Cada classe é um
**papel** — por isso não se escreve `text-sm`, `text-xs`, `md:text-lg` nem
`text-[13px]` em tela nenhuma. É a escala padrão do shadcn: **mesmo tamanho em
qualquer viewport**.

| Classe | Tamanho | Papel |
|---|---|---|
| `txt-numero` | 24px | KPI, número em destaque |
| `txt-numero-sm` | 18px | valor numérico em linha (total, contador) |
| `txt-titulo` | 24px | título da tela (um por tela) |
| `txt-secao` | 16px | título de card, diálogo, seção |
| `txt-subtitulo` | 14px | nome do item no card, subtítulo de bloco |
| `txt-corpo` | 14px | texto padrão, campo, botão, tabela |
| `txt-apoio` | 14px | descrição, dica, texto secundário |
| `txt-nota` | 12px | chrome: badge, legenda de gráfico, atalho |
| `eyebrow` | 11px | rótulo mono maiúsculo |

**`txt-subtitulo`, `txt-corpo` e `txt-apoio` medem os mesmos 14px** — e as três
classes continuam existindo. Numa escala padrão os degraus são curtos, então
quem separa esses papéis é **peso e cor**:

```tsx
<h3 className="txt-subtitulo font-semibold">Apto 302 — Bloco B</h3>
<p  className="txt-corpo">Encomenda da Shopee, recebida às 14h20.</p>
<p  className="txt-apoio text-muted-foreground">Retirar na portaria.</p>
```

Use a classe do **papel**, não a que "dá no mesmo": quando a escala for retunada
de novo (é um arquivo só), quem estiver com o papel certo acompanha sozinho.

**Não existe mais `text-base md:text-sm` no campo.** O `Input` é 14px em
qualquer tela. Efeito colateral aceito conscientemente: no Safari do iPhone a
página dá um leve zoom ao focar um campo (o navegador faz isso abaixo de 16px) e
não desfaz sozinho. Foi decisão de produto — se um dia incomodar, o conserto é
devolver `text-base md:text-sm` só ao `Input`/`Textarea`, não à escala inteira.

**Quem já traz a classe** (não repita): `PageHeader` (título + descrição),
`CardTitle`/`DialogTitle`/`SheetTitle`/`AlertDialogTitle` e suas descrições,
`Label`, `Input`, `Textarea`, `Button`, `Badge`, `Table`, `TabsTrigger`,
`EmptyState`, `StatCard`, `SimpleSelect`, `SearchSelect`, `StatusDot`.
Escrever `<Label className="txt-corpo">` de novo é ruído — e é assim que a
próxima pessoa troca por outro tamanho sem perceber que saiu do padrão.

Utilitário do Tailwind ainda vence a classe (camada `utilities` vem depois de
`components`), então dá para escapar num caso pontual — mas escreva o porquê no
código. Hoje só existe uma exceção: `file:text-sm` no `Input`, porque variante
do Tailwind (`file:`, `hover:`…) alcança utilitário e não classe da escala.

### `Combobox` e `SearchSelect` não são a mesma coisa

| | `SearchSelect` | `Combobox` |
|---|---|---|
| O valor | **tem** de ser um item da lista | pode ser qualquer texto |
| Gatilho | botão que mostra o rótulo | `Input` de verdade — o que está no campo É o valor |
| Onde se digita | campo de busca dentro da lista | no próprio campo |
| Use para | apartamento, morador (o id precisa existir) | transportadora (a lista é atalho, não regra) |

O caso que originou o `Combobox` é **transportadora** em `NovaEncomenda`: lista
fechada faria o porteiro que recebeu de uma transportadora regional escolher a
errada ou deixar vazio — os dois piores desfechos para quem depois lê o
relatório por transportadora. A lista existe para o caminho comum cair sempre na
mesma grafia; o resto continua digitável, com aviso de que está fora da lista.

**A lista mora em `lib/transportadoras.ts`, e o nome tem de bater com o que o
leitor de código devolve.** `detectarTransportadora()` (em `NovaEncomenda.tsx`)
preenche o campo sozinho ao escanear o pacote; se ele devolvesse "Azul Cargo
Express" e a lista dissesse "Azul Cargo", o mesmo pacote ficaria com grafias
diferentes conforme fosse escaneado ou digitado, e o relatório se dividiria em
duas linhas. O detector devolve o tipo `TransportadoraNome`, derivado da lista —
**nome fora dela não compila**. Ao mexer numa das pontas, rode `npx tsc`.

### Foto: nunca suba o que saiu do sensor

A câmera do celular entrega o JPEG inteiro — tipicamente 4000x3000 e 3 a 6 MB.
O serviço de OCR **descarta tudo acima de `OCR_MAX_LADO` na primeira operação**,
então esses megabytes subiam pelo 4G da portaria só para serem jogados fora: no
sinal ruim de uma portaria é a diferença entre ~30s e ~4s de espera, sem perder
um pixel que o servidor fosse usar.

`prepararFoto(file)` (`lib/imagem.ts`) reduz, recomprime e devolve também a
**nitidez** (variância do laplaciano) — é o que permite oferecer "tire outra"
*antes* de gastar upload e 1 a 3s de CPU. Qualquer falha devolve o arquivo
original: subir 4 MB é ruim, não subir é pior.

Dois detalhes que não são estética:

- **`MAX_LADO_OCR` espelha `OCR_MAX_LADO` de `ocr/app.py`.** Mudou um, mude o
  outro — acima do teto do servidor é desperdício de rede, abaixo é perder
  resolução que o reconhecedor usaria.
- **Desenhar num canvas destrói o EXIF**, e o OCR depende dele para não receber
  metade das etiquetas deitadas. Por isso `imageOrientation: 'from-image'` no
  `createImageBitmap`: ele aplica a rotação nos pixels antes do desenho.

No **celular** o `ScannerModal` usa a câmera nativa do sistema (`capture`), cujo
autofoco e resolução são muito melhores que a stream do navegador. O visor
in-app com `getUserMedia` é do **desktop** — e ali a resolução vai como `ideal`,
nunca `exact`: exigir o que a webcam não tem derruba a stream inteira com
`OverconstrainedError`.

### Diálogo: a margem e a rolagem já vêm do `DialogContent`

O `DialogContent` (e o `AlertDialogContent`) já traz `w-[calc(100%-2rem)]`,
`max-h-[calc(100dvh-2rem)]` e `overflow-y-auto` — 1rem de margem em volta no
celular e rolagem interna quando o formulário é grande. Na tela, passe **só a
largura de desktop** (`sm:max-w-lg`).

Não repita `max-h-[90vh] overflow-y-auto` no `className`: o `tailwind-merge`
faz o seu `max-h` vencer o da base, e `vh` no celular inclui a barra do
navegador — é exatamente o que fazia o diálogo ser cortado em cima e embaixo.
Altura de diálogo se mede em `dvh`.

O **X de fechar mora no `DialogHeader`**, em linha com o título — não flutuando
`absolute` no canto do `DialogContent`, onde cobria títulos longos. Consequência
prática: um diálogo **sem** `DialogHeader` não tem como ser fechado no X. Se a
tela não precisa de título, ela ainda precisa do header (com um `DialogTitle`
em `sr-only`, que o Radix exige de todo jeito por acessibilidade).

### Menu suspenso: o ícone do item não leva `mr-2`

`DropdownMenuItem`, `DropdownMenuSubTrigger`, checkbox e radio compartilham uma
base única (`ITEM_BASE`, em `components/ui/dropdown-menu.tsx`) com `gap-2` e
`[&>svg]:size-4`. O ícone entra solto — `<Download />`, sem classe de tamanho e
sem margem:

```tsx
<DropdownMenuItem onClick={…}>
  <Download className="text-muted-foreground" />
  <span>Instalar app</span>
  {ativo && <Check className="ml-auto" />}   {/* marca à direita */}
</DropdownMenuItem>
```

A base **não** define cor de ícone de propósito: uma regra `[&>svg]:text-…`
venceria a classe posta no próprio `svg` (seletor de descendente ganha do
seletor de classe simples) e engoliria o `text-primary`/`opacity-0` de quem
precisa colorir ou esconder o ícone — foi o que quase quebrou o `SimpleSelect`.
Cor de ícone se põe no ícone.

O conteúdo é uma **superfície flutuante** como o diálogo: `rounded-surface`,
`border-surface` e `shadow-panel-lg` já vêm da base — a tela passa só a largura
(`className="w-64"`).

### Nunca declare um componente dentro de outro

```tsx
// ❌ ERRADO: função nova a cada render → o React desmonta e remonta tudo
export function Layout() {
  const SidebarBody = () => <nav>…</nav>;
  return <SidebarBody />;
}

// ✅ CORRETO: componente no escopo do módulo, recebendo o que precisa por prop
function SidebarBody({ groups }: Props) { return <nav>…</nav>; }
```

O React identifica componente pela **função**. Recriada a cada render, ela vira
"outro componente": o DOM é destruído e refeito, o estado interno some, a
rolagem volta ao topo e a tela pisca. Foi exatamente o que fazia a sidebar
"recarregar" a cada troca de rota (o `Layout` re-renderiza por causa do
`useLocation`). Re-render é barato e esperado; **remontar não é**.

Para conferir se um pedaço está remontando: marque o nó no DevTools
(`$0.dataset.marcador = '1'`), navegue e veja se o marcador sobreviveu.

### Cor: use o token, nunca o hex

A paleta inteira está em `styles.css` (tema **Warm Sand**, âmbar `#FFC72C`).
Escolha pelo papel da superfície, não pela cor:

| Onde | Classe |
|---|---|
| Menu/topo (shell) | `bg-sidebar` |
| Área de trabalho e **campos** | `bg-background` |
| Card de conteúdo | `bg-card` |
| Diálogo, gaveta, dropdown | `bg-popover` |
| Bloco secundário dentro do card | `bg-muted` |
| Hover | `hover:bg-accent` |

Cor fixa (`bg-[#...]`) quebra o dark mode e a troca de tema — não use.

### Superfície: a sombra separa, a borda quase não aparece

O card se destaca do fundo por **tom + sombra**; a borda (`border-surface`) é um
fio que só impede o card de sumir em tela muito clara. Três consequências que
mudam como se escreve tela:

1. **Card dentro de card é proibido.** Duas sombras empilhadas viram sujeira.
   Para agrupar dentro de um card, use bloco **chapado**: `rounded-lg bg-muted`,
   sem `border` e sem sombra. O preenchimento já delimita.
2. **Raio de superfície é `rounded-surface`** (20px), não `rounded-xl`. Controle
   (botão, campo) continua no raio menor — `Card` e `DialogContent` já trazem o
   certo.
3. **Barra de busca/ações fica FORA do card da lista.** Ela comanda a lista, não
   é conteúdo dela; dentro, virava mais uma caixa dentro da caixa.

### A casca de uma tela de listagem: `PageShell`

No **celular** toda tela de listagem/cadastro abre com uma **faixa âmbar** que
carrega menu, condomínio, avatar, título, busca e filtro; a folha branca sobe por
cima dela com o canto arredondado. No **desktop** a faixa não existe — a sidebar
já dá a identidade — e as mesmas declarações viram um cabeçalho comum.

```tsx
<PageShell
  icon={Building2} eyebrow="Condomínio" title="Apartamentos"
  description="Unidades do condomínio…"
  busca={{ valor: search, aoMudar: setSearch, placeholder: 'Buscar…' }}
  filtros={<CamposDaGaveta />} filtrosAtivos={n} aoLimparFiltros={limpar}
  acoes={<><Button>Importar CSV</Button><Button>+ Novo</Button></>}
>
  <DataTable … />
</PageShell>
```

**A faixa é uma coisa só partida em dois arquivos**: a barra com
menu/condomínio/avatar mora no `Layout`, o título e a busca no `PageShell`. Elas
se unem porque o `<main>` do `Layout` **não tem padding nem fundo no celular** —
pôr fundo ali parte a faixa no meio. Não é context nem portal de propósito:
custaria um efeito por tela e título piscando na troca de rota; do jeito atual o
que une as duas metades é só a cor, que vem do mesmo token.

**Cor pelo token `banner`, nunca `primary`.** No escuro o âmbar puro num bloco
desse tamanho vira um holofote, então `--banner` fecha para `#5C4400` com texto
claro (8:1). O botão de ação segue no `#FFC72C` cheio — ali a cor tem o tamanho
de um botão. Use `bg-banner`, `text-banner-foreground` e, para controle dentro
dela, `bg-banner-surface`.

**Dentro de uma aba, passe `embutido`.** Em `/admin/condominios/:id` e
`/meus-condominios/:id` a listagem é uma aba: sem `embutido` apareceria um
"Apartamentos" âmbar no meio da página — cabeçalho de tela dentro de outro.

**A página fica magra**: sem `PageHeader` e sem `<div className="space-y-6 pb-10">`.
Quem desenha cabeçalho e respiro é o `PageShell`.

**`PageHeader` está aposentado.** Toda tela dentro do `Layout` usa `PageShell` —
listagem, painel, detalhe e formulário. As únicas fora são `Login` e o
autocadastro (`/cadastro/:token`), que são públicas e não têm barra de topo.

**Detalhe e formulário passam `voltar`**: o botão da esquerda da barra do topo
vira uma seta em vez do menu. Quem atravessa a fronteira entre página e `Layout`
é só essa rota, por um contexto de um valor só (`voltar-slot.tsx`) — título,
busca e ações continuam desenhados pela página.

```tsx
<PageShell icon={Package} eyebrow="Encomenda" title={`Apto ${apto}`} voltar="/encomendas">
```

**Abas ficam na folha branca**, dentro de `children` — nunca presas à faixa.

#### Nunca dê altura de viewport à folha

A folha do `PageShell` **cresce só com o conteúdo**. O container de rolagem
(`main > div` no `Layout`) mede `100dvh − altura do header`; qualquer
`h-dvh`/`min-h-dvh` na folha faz o conteúdo medir `faixa + 100dvh` e cria barra
de rolagem em **toda** tela, com lista ou sem.

Quem faz a folha *parecer* chegar ao rodapé numa tela curta é o `bg-background`
do container de rolagem — a área abaixo da folha já é da mesma cor. Foi assim
que o `min-h-dvh` saiu.

> Extensões de "canonical classes" do editor já trocaram `h-full` por `h-dvh` em
> massa neste projeto e injetaram `h-dvh` aqui. São coisas diferentes: `h-full` é
> 100% do pai, `h-dvh` é a altura da janela. Se a rolagem fantasma voltar, é o
> primeiro lugar a conferir.

Passo a passo e os quatro tipos de tela: skill `tela-listagem`.

### Lista de registros: card no celular, tabela no desktop

Tabela de 5 colunas em 375px obriga o porteiro a arrastar para ver o telefone —
e aí some o nome. Por isso `DataTable` aceita `mobileCard`: abaixo de `md` cada
linha vira um `ListCard`; a tabela volta no desktop.

```tsx
<DataTable
  columns={columns}
  data={dados}
  mobileCard={(m) => (
    <ListCard
      icone={User}
      titulo={m.nome}
      selo={m.principal ? <Badge variant="secondary">Principal</Badge> : undefined}
      acoes={<Button variant="ghost" size="icon-sm" aria-label={`Editar ${m.nome}`}>…</Button>}
      campos={[
        { rotulo: 'Unidade', valor: m.apartamento?.identificador ?? '—' },
        { rotulo: 'Telefone', valor: formatarTelefone(m.telefoneE164) },
        { rotulo: 'Notificação', valor: <Badge>…</Badge>, largura: 'inteira' },
      ]}
    />
  )}
/>
```

**`mobileCard` é uma prop, não algo derivado das `columns`** — de propósito.
Derivar produziria "rótulo: valor" para toda coluna, inclusive as que só existem
para ordenar. No celular não cabe tudo: o card é uma **escolha** do que importa,
e quem escolhe é a tela.

O par **rótulo pequeno apagado em cima, valor legível embaixo** (`txt-nota
uppercase text-muted-foreground` sobre `txt-corpo`) é o que substitui o cabeçalho
da tabela. Sem ele o card vira uma lista de valores sem nome. `largura: 'inteira'`
para texto longo (e-mail, observação), que não cabe em meia coluna.

Quem já usa: `MoradoresManager`, `ApartamentosManager`, `EquipeManager`. Vagas
monta os cards direto (a tela nunca teve tabela), mas segue o mesmo par
rótulo/valor.

## Versão e atualização automática

- `APP_VERSION` (`lib/versao.ts`) vem de `web/package.json` pelo `define` do
  Vite. Aparece na sidebar, embaixo do condomínio.
- `useAtualizacaoAutomatica()` (`hooks/use-atualizacao.ts`), montado no `App`,
  procura build novo (1 min, ao voltar ao primeiro plano, ao reconectar) e
  recarrega sozinho **em momento seguro**: troca de tela, ou app ocioso sem
  diálogo aberto e sem campo preenchido.
- Por isso o `vite.config.ts` usa `registerType: 'prompt'`. Com `autoUpdate` o
  service worker recarregaria na hora que quisesse — inclusive no meio de um
  cadastro.
- **Toda alteração sobe a versão**: `npm run versao correcao|recurso|maior` +
  linha no `CHANGELOG.md`. Ver "Versionamento" no `CLAUDE.md` raiz.

## Hooks de contexto (`hooks/use-tenant-config.ts`)

| Hook | Devolve |
|---|---|
| `useAuthMe()` | Usuário + config + condomínio ativo (uma query compartilhada) |
| `useCondominioAtivo()` | `{ id, nome }` do condomínio em uso |
| `useModuleEnabled('vagas')` | Módulo contratado? (`undefined` = ainda não sei) |
| `useModuleGate('vagas')` | Decisão para proteger rota (nunca nega com valor provisório) |
| `useTrocarCondominio()` | Troca o condomínio ativo e limpa o cache |

## Ao alterar o frontend

- [ ] Tela nova → rota + menu + `@Roles` da API combinando (veja a skill
      `tela-frontend`).
- [ ] Texto novo → classe da escala (`txt-*`), nunca `text-sm`/`text-[13px]`.
      Confira com:
      ```bash
      grep -rnP "(?<![\w-])((sm|md|lg|xl):)?text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(?![\w-])|text-\[[0-9]" web/src --include="*.tsx"
      ```
      A única linha esperada é o `file:text-sm` do `Input` (variante do Tailwind
      não alcança classe da escala). Qualquer outra é regressão.
- [ ] Campo novo vindo da API → atualize `api/types.ts`.
- [ ] Componente reaproveitável → `components/ui/` e registre em "Peças
      reutilizáveis" no `CLAUDE.md` raiz.
- [ ] Rodar `npx tsc --noEmit -p tsconfig.json` e `npx vite build`.
- [ ] Atualizar esta doc e a do módulo correspondente no backend.
