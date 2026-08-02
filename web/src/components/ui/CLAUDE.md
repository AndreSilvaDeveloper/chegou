# Componentes de UI — o contrato da identidade visual

> Este arquivo é carregado sozinho sempre que alguém trabalha em
> `web/src/components/ui/`. Ele responde a uma pergunta só: **como fazer o
> componente novo parecer parte do sistema.**
>
> Regra de ouro: **antes de desenhar um controle, procure aqui.** Quase todo
> "componentezinho" que se escreve na tela já existe — e quando não existe, o
> lugar dele é aqui, não na página. Cada divergência desta lista custou uma
> sessão de conserto; elas estão registradas no fim, em "Armadilhas já pagas".

---

## 1. Quero X → use Y

| Preciso de… | Componente | Onde |
|---|---|---|
| Casca da tela (título, busca, filtro, ações, voltar) | `PageShell` | `ui/page-shell.tsx` |
| Lista de registros | `DataTable` com `mobileCard` | `ui/data-table.tsx` |
| Um registro como card | `ListCard` / `ListCardStack` | `ui/list-card.tsx` |
| Trocar o **conteúdo** da tela | `Tabs` + `TabsContent` | `ui/tabs.tsx` |
| Filtrar a **mesma** lista | `SegmentedFilter` | `ui/segmented-filter.tsx` |
| Qualquer sobreposição (form, câmera, espera) | `Dialog` | `ui/dialog.tsx` |
| Formulário em diálogo | `FormDialog` | `ui/form-dialog.tsx` |
| Confirmar ação destrutiva | `ConfirmDialog` | `ui/confirm-dialog.tsx` |
| Indicador numérico | `StatCard` | `ui/stat-card.tsx` |
| Estado de um registro | `StatusDot` (ponto + rótulo) ou `Badge` | `ui/status-dot.tsx` |
| Select | `SimpleSelect` | `ui/simple-select.tsx` |
| Select com lista grande | `SearchSelect` | `ui/search-select.tsx` |
| Campo que aceita valor fora da lista | `Combobox` | `ui/combobox.tsx` |
| Telefone | `PhoneInput` (**nunca peça `+55`**) | `ui/phone-input.tsx` |
| CPF ou CNPJ | `DocumentoInput` (**nunca peça "só os números"**) | `ui/documento-input.tsx` |
| Sim/não numa linha | `CheckboxField` | `ui/checkbox.tsx` |
| Aviso passageiro (salvo, erro) | `toast` do Sonner | `ui/sonner.tsx` |
| Aviso que **fica** na tela, com ação | componente próprio — veja `AvisoAtualizacao` | `components/` |
| Carregando | `Skeleton` (**nunca** o texto "Carregando…") | `ui/skeleton.tsx` |
| Lista vazia | `EmptyState` com ação | `ui/empty-state.tsx` |
| Gráfico | `ChartContainer` + cores de `lib/graficos.ts` | `ui/chart.tsx` |
| Menu do avatar / ações agrupadas | `DropdownMenu` | `ui/dropdown-menu.tsx` |
| Código de retirada | `CodigoStrip` | `ui/codigo-strip.tsx` |

Peça nova que serve a mais de uma tela **mora aqui**, com um comentário dizendo
por que ela existe. Peça de um domínio só mora na pasta dele
(`components/vagas/`, `components/encomendas/`, …).

---

## 2. As seis leis

Elas atravessam todos os componentes. Se a peça nova quebra uma, ela vai
destoar — não importa o quanto esteja bonita isolada.

### 1. Cor sai de token, e âmbar é da AÇÃO

Nada de `#hex`, nada de `bg-sky-500` solto. Escolha pelo papel:

| Papel | Classe |
|---|---|
| Menu e topo (shell) | `bg-sidebar` |
| Área de trabalho e **campos** | `bg-background` |
| Card de conteúdo | `bg-card` |
| Diálogo, gaveta, menu suspenso | `bg-popover` |
| Bloco secundário dentro do card | `bg-muted` |
| Hover | `hover:bg-accent` |
| Trilho/pílula de controle segmentado | `bg-segmented` / `bg-segmented-active` |

**O âmbar (`primary`) é reservado para a ação e para o foco.** Ele não marca aba
selecionada, passo atual, ícone decorativo, borda de card nem cartão de destaque
— nessas telas o botão âmbar de ação costuma estar na mesma dobra, e dois
âmbares fazem o botão deixar de saltar. Para marcar seleção, use degrau de tom
(+ sombra no claro, + borda no escuro).

**Cor de estado é reservada também**: verde/âmbar/vermelho significam bom,
atenção e falha. Nunca vire "a quarta série" de um gráfico, e nunca apareça sem
rótulo — cor sozinha não informa.

### 2. Tamanho de texto sai da escala

`txt-numero`, `txt-numero-sm`, `txt-titulo`, `txt-secao`, `txt-subtitulo`,
`txt-corpo`, `txt-apoio`, `txt-nota`, `eyebrow`. **Nunca** `text-sm`,
`md:text-lg`, `text-[13px]`. Detalhe da escala em [web/src](../../CLAUDE.md).

Os componentes daqui já trazem a classe certa (`CardTitle`, `Label`, `Button`,
`Badge`). **Repetir a classe na tela é ruído** e é assim que a divergência volta.

### 3. Tamanho de controle sai do componente

`Button` e `Input` já são `h-9`. **Nunca** `h-12`, `min-h-[44px]`,
`min-h-[56px]`. Precisa destoar? Use a variante (`size="lg"`, `size="sm"`,
`size="icon-sm"`). Altura escrita à mão só com comentário dizendo o porquê — hoje
existem duas no projeto inteiro, e as duas são campo-herói (o código de 4 dígitos
na retirada e o número do apartamento no cadastro).

### 4. Quatro superfícies, e card dentro de card é proibido

`sidebar` → `background` → `card` → `popover`. Quem separa é **tom + sombra**; a
borda (`border-surface`) é um fio que só impede o card de sumir.

Para agrupar dentro de um card use **bloco chapado**: `rounded-lg bg-muted`,
**sem borda e sem sombra**. O preenchimento já delimita. Isso vale para aviso,
passo a passo, bloco de ícone, resumo — tudo.

### 5. Raio por papel

| O quê | Classe |
|---|---|
| Controle (botão, campo, badge, bloco chapado) | `rounded-lg` (`--radius`, 12px) |
| Superfície (card, diálogo, gaveta) | `rounded-surface` (20px) |
| Pílula (controle segmentado, botão de ação da tela, avatar) | `rounded-full` |

### 6. Mobile-first, e 375px é a medida

Estilo base é o do celular; `sm:`/`md:` só amplia. Grade começa em
`grid-cols-1`. **A página nunca rola na horizontal** — e tabela vira card no
celular em vez de rolar. A exceção é o **trilho segmentado**, que rola sozinho
quando não cabe (ver abaixo): ali quebrar linha ficava pior. Botão de ícone
precisa de `aria-label`.

---

## 3. O catálogo

### `PageShell` — a casca de toda tela

Faixa âmbar no celular (menu/voltar, título, busca, filtro) e cabeçalho comum no
desktop. A página fica **magra**: sem cabeçalho próprio e sem wrapper de padding.

- `voltar="/rota"` troca o menu pela seta — use em tela de detalhe e formulário.
- `acoes` é a fita de botões: `className="flex-1 rounded-full sm:flex-none"` em
  cada um (divide a linha no celular, volta ao tamanho do rótulo no desktop).
  **Não embrulhe as ações num `<div>`** — o embrulho vira um item só da fita e o
  `flex-1` para de funcionar.
- `filtros` só se a gaveta existir de verdade; sem ele o botão nem aparece.

### `ListCard` — um registro, em qualquer lista

Três níveis de leitura, nesta ordem: **título** (o que identifica) → **subtítulo**
(o que confirma qual registro é) → **campos** (o resto, com rótulo `eyebrow`).

```tsx
<ListCard
  icone={User}                          // bloco chapado de 40px
  titulo={m.nome}
  subtitulo={<span className="font-mono">{m.apartamento?.identificador}</span>}
  selo={m.principal ? <Badge variant="secondary">Principal</Badge> : undefined}
  acoes={<Button variant="ghost" size="icon-sm" aria-label={`Editar ${m.nome}`}>…</Button>}
  campos={[
    { rotulo: 'Telefone', icone: Phone, valor: formatarTelefone(m.telefoneE164) },
    { rotulo: 'Valor', icone: Wallet, enfase: true, valor: fmtMoeda(v) },
    { rotulo: 'Observações', icone: StickyNote, largura: 'inteira', valor: obs },
  ]}
/>
```

| Prop | Regra |
|---|---|
| `acoes` | **só botão de ícone** (editar, histórico, remover) — as margens negativas de lá alinham o ícone com a borda |
| `destaque` | conteúdo no canto que **não** é botão (o `CodigoStrip`) |
| `rodape` | **aviso** do registro, não ação. Fica colado no pé; numa grade os cards esticam juntos e os rodapés se alinham |
| `to` | o card inteiro vira link (seta + realce no hover). Não use junto com `acoes`: botão dentro de link é armadilha de clique |
| `campo.enfase` | **um por card** — o dado que a tela existe para mostrar |
| `campo.largura: 'inteira'` | texto longo; a meia largura corta com reticências, a inteira quebra linha |

### `Tabs` e `SegmentedFilter` — a mesma pele, semânticas diferentes

As classes moram em `tabs.tsx` (`TRILHO_SEGMENTADO`, `SEGMENTO`,
`SEGMENTO_ATIVO`) e o filtro importa de lá. Mudou o desenho, mudou nos dois.

- **Aba** troca o conteúdo (cada uma tem painel) → Radix, `role="tab"`, teclado.
- **Filtro** mantém o conteúdo e muda o recorte → botões com `aria-pressed`.

Na dúvida: se ao clicar troca o que a tela mostra, é aba; se filtra a mesma
lista, é filtro.

**O trilho é uma linha só e rola quando não cabe.** Nunca `grid-cols-N` (coluna
fixa espreme o rótulo) e nunca `flex-wrap` (num S24 Ultra sobrava "Todos"
sozinho numa segunda fita, e o controle parecia quebrado). Cabendo, ele fica
parado; o `SegmentedFilter` ainda traz o selecionado para a vista sozinho quando
a seleção vem de fora ou a tela abre já filtrada.

Precisa de um par ligado/desligado com a mesma cara (tipo de pacote, por
exemplo)? Importe `SEGMENTO`/`SEGMENTO_ATIVO` e monte os botões — é o mesmo
controle, só que desmarcável.

### Diálogos — **toda** sobreposição é `Dialog`

Inclusive câmera, visor de leitura e bloqueio de espera. Nada de `fixed inset-0`
com overlay próprio: o `Dialog` já dá superfície, raio, rolagem em `dvh`, Escape
e clique fora.

- O **X fica no `DialogHeader`**, em linha com o título. Diálogo sem header não
  tem como ser fechado no X (se não quer título visível, use `sr-only` — o Radix
  exige um `DialogTitle` de qualquer forma).
- **Rodapé**: `<DialogFooter className="pt-4">` — uma linha, botões nas pontas,
  em qualquer viewport. `FormDialog` já entrega isso.
- **Fechar precisa ter significado**: num diálogo de processo, ligue
  `onOpenChange` ao cancelamento de verdade (abortar o upload, a leitura).

### `Button`

- Variantes: `default` (âmbar, a ação), `outline`, `ghost`, `destructive`.
- `size="icon-sm"` para ação de card; `size="lg"` para ação principal de diálogo.
- **`asChild` não tem estado de carregando** — ele entrega o filho ao `Slot` do
  Radix, que aceita um só. Link não carrega, navega.
- Botão só de ícone **sempre** com `aria-label`.

### `StatCard` — indicador

Rótulo `eyebrow`, número mono/tabular, trilho de 3px na cor da variante.
Variantes: `default`, `primary`, `info`, `success`, `warning`, `danger`.

**A variante segue o significado, e combina com o gráfico ao lado**: "recebidas"
é `info` (o mesmo azul da série de entrada), "aguardando" é `warning`,
"retiradas" é `success`. Dois indicadores âmbar lado a lado se confundem.

### Gráficos

Cor, eixo, grade e ponta de barra saem de `lib/graficos.ts` — **nenhum
hexadecimal na tela**. `SERIE_ENTRADA`/`SERIE_SAIDA` para identidade,
`ESTADO_*` para significado, `corDeEspera()` para escalas ordenadas.

Duas regras de forma, antes da cor:

1. **Só empilhe o que soma um todo real.** Subconjunto com o conjunto, ou
   contagens de datas diferentes, não somam — viram um total que não existe.
2. **Fluxo e estoque não dividem eixo.** "Quanto entrou" é fluxo; "quanto está
   parado" é estoque — o segundo vai para indicador ou texto.

Antes de mudar cor de gráfico, rode o validador da skill `dataviz`.

### Toast (`Toaster`) — e o que **não** é toast

O `Toaster` fica no topo à direita, sobre a superfície do projeto. **Sem
`richColors`**: ele repinta o toast com a paleta do próprio Sonner, e era daí
que saía botão preto onde a ação do sistema é âmbar. Cor de estado aqui é o
ícone colorido sobre superfície neutra — a mesma língua do `StatusDot`.

**Toast é passageiro.** Aviso que fica esperando na tela (versão nova, conexão
caída) ganha componente próprio, no rodapé: forçar `duration: Infinity` cobra o
preço no layout (o botão de fechar do Sonner é posicionado por conta dele e cai
por cima do título) e no tema. Referência pronta:
`components/AvisoAtualizacao.tsx` — mesma anatomia do card de lista, no canto
inferior, respeitando `safe-area-inset-bottom`.

### `DropdownMenu`

Ícone de item entra solto — a base já tem `gap-2` e `[&>svg]:size-4`, então
**nada de `mr-2`**. A base não define cor de ícone de propósito: uma regra
`[&>svg]:text-…` venceria a classe posta no próprio `svg` e engoliria o
`text-primary`/`opacity-0` de quem precisa colorir ou esconder.

---

## 4. Antes de abrir o PR

- [ ] Nenhum `text-sm`/`text-lg`/`text-[13px]`; tudo na escala `txt-*`.
- [ ] Nenhuma altura à mão (`h-12`, `min-h-[44px]`) sem comentário do porquê.
- [ ] Nenhum `#hex` e nenhuma cor do Tailwind solta fora de estado semântico.
- [ ] Âmbar só na ação/foco — não em aba, passo, ícone ou borda decorativa.
- [ ] Nenhum `Card` dentro de `Card`; bloco interno chapado (`rounded-lg bg-muted`).
- [ ] Botão de ícone com `aria-label`; campo com `Label`.
- [ ] Lista com `mobileCard`; ação de registro em `acoes`, não em botão largo.
- [ ] Diálogo com rodapé `pt-4` e X no header.
- [ ] Testado em 375px, nos dois temas, sem rolagem horizontal.
- [ ] `npx tsc --noEmit -p tsconfig.json && npx vite build` limpos.
- [ ] Versão subida (`npm run versao correcao`) e linha no `CHANGELOG.md`.

---

## 5. Armadilhas já pagas

Cada uma custou uma sessão. Não as recompre.

| O que parecia certo | Por que não era |
|---|---|
| X do diálogo `absolute` no canto | Cobria o título longo. Ele vive no `DialogHeader`, em linha |
| Ação de card como botão largo no rodapé | A mesma lista parecia outro tipo de registro conforme a tela |
| `grid-cols-4` no trilho de filtros | Espremia "Pendentes" e "Cancelados" em 375px |
| Trocar a grade por `flex-wrap` no trilho | Resolveu o aperto e criou outro: "Todos" descia sozinho para uma segunda fita. Trilho é uma linha só, que rola |
| Pílula selecionada em `bg-card` sobre `bg-muted` | Dentro do card lia como "mais escuro"; na folha ficava mais clara que o fundo e sumia. Daí os tokens `--segmented*` |
| Empilhar 3 séries no gráfico de volume | Uma era subconjunto da outra e a terceira contava por outra data: a pilha desenhava um total inexistente |
| Hexadecimal na cor da série | Não acompanha o tema — o azul de fundo claro continuava igual no escuro |
| `Button asChild` com spinner | O `Slot` do Radix aceita um filho; dois derrubavam a tela ("Ver contrato") |
| Faixa `bg-muted/50` no `CardFooter` | Pintava cantos retos por cima do card arredondado de 20px |
| `border-1` no botão de tipo de pacote | Classe que o Tailwind não gera: os botões estavam sem borda nenhuma |
| Dois mapas de status (lista e detalhe) | Mesmo dado com duas cores e dois textos; e status novo entrava só num deles |
| Embrulhar `acoes` do `PageShell` num `<div>` | O embrulho vira um item só da fita e o `flex-1` dos botões para de valer |
| Toast com `duration: Infinity` para aviso persistente | O X do Sonner caía por cima do título e o `richColors` pintava a ação com a cor da biblioteca. Aviso que fica é componente próprio |
| `<Input>` + `replace(/\D/g,'')` no campo de CPF/CNPJ | Quatro telas, quatro versões do mesmo campo — uma sem a fonte mono, outra sem `maxLength`, todas pedindo "só os números" ao usuário. Documento de cobrança se digita igual em todo lugar: `DocumentoInput` |

---

## 6. Onde está o resto

| Assunto | Doc |
|---|---|
| Telas, hooks, api client, padrões de página | [web/src](../../CLAUDE.md) |
| Escala tipográfica e paleta (valores) | `web/src/styles.css` |
| Perfis de acesso, multitenant, versionamento | [raiz](../../../../CLAUDE.md) |
| Passo a passo de tela nova | skill `tela-frontend` |
| Passo a passo de listagem | skill `tela-listagem` |
