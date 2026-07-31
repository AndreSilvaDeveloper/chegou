# Frontend — painel web

React + Vite + TailwindCSS + shadcn/ui. Quem mais usa é o **porteiro**, muitas
vezes pessoa mais velha, no celular, em pé na portaria — todo padrão daqui existe
por causa disso.

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
lg:grid-cols-7`): o alvo de toque não encolhe para caber tudo numa fita.

## Padrões de tela

| Situação | Use |
|---|---|
| Carregando | `Skeleton` (nunca o texto "Carregando…") |
| Lista vazia | `EmptyState` com ação |
| Formulário | `FormDialog` (`components/ui/form-dialog.tsx`) |
| Ação destrutiva | `ConfirmDialog` (nunca `confirm()`) |
| Indicador numérico | `StatCard` |
| Escolha de sim/não numa linha | `CheckboxField` (caixa + texto, alvo de 48px). `Switch` é para liga/desliga que vale na hora |
| Select | `SimpleSelect` |
| Select com lista grande | `SearchSelect` (busca por digitação; use `onSearchChange` para buscar no servidor) |
| Campo com sugestões, mas que aceita o que for digitado | `Combobox` (ver abaixo) |
| Telefone | `PhoneInput` — digita `(32) 99999-9999`, entrega E.164. **Nunca peça `+55`** |
| Telefone em listagem | `formatarTelefone()` de `@/lib/telefone` |
| Foto que vai subir para o servidor | `prepararFoto()` de `@/lib/imagem` (ver abaixo) |
| Erro de request | `toast.error(mensagemErro(err, 'Não foi possível …'))` |
| Dinheiro, data, competência | `fmtMoeda` / `fmtData` / `fmtCompetencia` de `@/lib/formato` |

Regras fixas: mobile-first (base = celular, `sm:`/`md:` amplia), `min-h-[48px]`
em botão de ação, ícone **sempre** com texto, `Label` sempre visível, ícones só
do Lucide, dark mode em tudo, testar em 375px.

### Tamanho de texto: use a escala, nunca `text-sm`

A escala vive em `styles.css` (bloco "ESCALA TIPOGRÁFICA"). Cada classe é um
**papel**, e já carrega o tamanho do celular e o do desktop — por isso não se
escreve `text-sm`, `text-xs`, `md:text-lg` nem `text-[13px]` em tela nenhuma:

| Classe | Celular | Desktop | Papel |
|---|---|---|---|
| `txt-numero` | 30px | 36px | KPI, número em destaque |
| `txt-numero-sm` | 20px | 24px | valor numérico em linha (total, contador) |
| `txt-titulo` | 24px | 30px | título da tela (um por tela) |
| `txt-secao` | 18px | 20px | título de card, diálogo, seção |
| `txt-subtitulo` | 16px | 18px | nome do item no card, subtítulo de bloco |
| `txt-corpo` | 16px | 14px | texto padrão, campo, botão, tabela |
| `txt-apoio` | 14px | 14px | descrição, dica, texto secundário |
| `txt-nota` | 12px | 12px | chrome: badge, legenda de gráfico, atalho |
| `eyebrow` | 11px | 11px | rótulo mono maiúsculo |

**O corpo encolhe do celular para o desktop (16 → 14) de propósito.** No celular
o porteiro está em pé, com o aparelho na mão e frequentemente com presbiopia:
16px é o mínimo confortável — e é também o que impede o iOS de dar zoom ao focar
um campo. No desktop a mesma pessoa está sentada, mais perto e com mais
informação na tela; 14px é o tamanho certo ali. O `Input` já fazia isso
(`text-base md:text-sm`); a escala só estendeu a regra para o resto.

`txt-apoio` **não** encolhe: ele já é secundário pela cor, e encolher também o
levaria a 12px no desktop. A hierarquia contra o corpo vem da cor, e no celular
também do tamanho.

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
