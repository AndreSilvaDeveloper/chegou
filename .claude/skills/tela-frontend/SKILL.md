---
name: tela-frontend
description: Cria página ou diálogo no painel do Chegou seguindo os padrões do projeto — mobile-first para o porteiro, shadcn/ui, react-query, FormDialog, controle de acesso por perfil e módulo, e atualização da doc do frontend. Use ao criar ou reformular tela do web/.
---

# Tela nova no painel

Quem mais usa o sistema é o porteiro, no celular, em pé na portaria — daí o
mobile-first. Os tamanhos são os **padrões do shadcn/ui**: não invente altura
nem tamanho de fonte.

Antes: rode o fluxo da skill `funcionalidade-nova` (perfis de acesso).

> **Tela que lista registros e permite cadastrar?** Use a skill `tela-listagem`:
> ela tem a casca própria dessas telas (faixa âmbar no celular com título, busca
> e filtro; tabela no desktop). Esta skill aqui vale para o resto.

> **O catálogo de componentes é `web/src/components/ui/CLAUDE.md`** — ele
> responde "quero X, uso Y", traz as seis leis da identidade e a lista de
> armadilhas já pagas. Leia antes de desenhar qualquer controle: quase tudo já
> existe, e o que não existe deve nascer lá, não na página.

## Anatomia de uma página

```tsx
export function MinhaTela() {
  const query = useQuery({ queryKey: ['coisas'], queryFn: () => api.get<Coisa[]>('/coisas') });

  return (
    <PageShell
      icon={Algo}
      eyebrow="Área"
      title="Título da tela"           // caixa de sentença, não Title Case
      description="O que é"
      acoes={
        <Button className="flex-1 rounded-full sm:flex-none">
          <Plus className="mr-2 h-4 w-4" /> Ação principal
        </Button>
      }
    >
      <div className="space-y-6">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-surface" />   // nunca "Carregando..."
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState icon={Algo} title="Nada por aqui" description="..." actionLabel="Criar" onAction={...} />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">...</div>
        )}
      </div>
    </PageShell>
  );
}
```

A página é **magra**: quem desenha cabeçalho, busca, faixa âmbar e padding é o
`PageShell`. Em tela de detalhe ou formulário, passe `voltar="/rota"` — o botão
da esquerda vira a seta em vez do menu.

**Não embrulhe `acoes` num `<div>`**: o embrulho vira um item só da fita de
botões e o `flex-1` de cada um para de funcionar.

## Tamanho de texto: escolha o papel, não o número

**Nunca escreva `text-sm`, `text-xs`, `text-lg`, `text-2xl`… numa tela.** Use a
classe da escala (definida em `web/src/styles.css`). Ela é a escala padrão do
shadcn — mesmo tamanho em qualquer viewport:

| Classe | Tamanho | Quando |
|---|---|---|
| `txt-numero` | 24px | KPI, número em destaque |
| `txt-numero-sm` | 18px | valor numérico em linha (total, contador) |
| `txt-titulo` | 24px | título da tela — **um por tela**, e o `PageHeader` já põe |
| `txt-secao` | 16px | título de card/diálogo/seção — `CardTitle` e `DialogTitle` já põem |
| `txt-subtitulo` | 14px | nome do item dentro do card, subtítulo de bloco (`<h3>`) |
| `txt-corpo` | 14px | texto padrão, tabela, campo, botão — `Input`, `Label`, `Button` já põem |
| `txt-apoio` | 14px | descrição, dica, texto secundário (vem com `text-muted-foreground`) |
| `txt-nota` | 12px | chrome: badge, legenda de gráfico, atalho de menu |
| `eyebrow` | 11px | rótulo mono maiúsculo acima do título |

**`txt-subtitulo`, `txt-corpo` e `txt-apoio` medem o mesmo.** Escolha pelo papel
mesmo assim — quem separa os três é peso (`font-semibold`) e cor
(`text-muted-foreground`), e é o papel que sobrevive à próxima retunagem da
escala. Na dúvida entre `txt-corpo` e `txt-apoio`: se o porteiro **precisa** ler
para trabalhar, é `txt-corpo`. Nada que precise ser lido vai para `txt-nota`.

**Não repita a classe que o componente já traz** (`<CardTitle className="txt-secao">`,
`<Label className="txt-corpo">`): é o tipo de ruído que faz a próxima pessoa
trocar por outro tamanho sem perceber que está saindo do padrão.

Precisa mesmo de um tamanho fora da escala? Utilitário do Tailwind ainda vence a
classe — mas escreva um comentário dizendo o porquê, senão é só divergência.

## Regras que não se negociam

- **Mobile-first**: estilo base é o do celular; `sm:`/`md:` só para ampliar.
  Grid começa em `grid-cols-1`. Botão começa em `w-full`, vira `sm:w-auto`.
- **Tamanho de texto vem da escala** (`txt-*`, tabela acima) — nunca `text-sm`
  e afins soltos, nunca `text-[13px]`.
- **Tamanho de controle vem do componente**: `Button` e `Input` já são `h-9`.
  Não escreva `h-12`/`min-h-[48px]`; se precisar destoar, use `size="lg"`/`"sm"`.
- **Botão só de ícone precisa de `aria-label`** — nunca emoji como ícone.
- **`Label` no campo de formulário** (`<Label htmlFor>`). Placeholder como rótulo
  só em campo auto-evidente (busca), e aí com `aria-label`.
- **`Skeleton`** no carregamento, `EmptyState` no vazio.
- **Ação destrutiva** passa por `ConfirmDialog` — nunca `confirm()` nativo.
- **Lista de registros**: `DataTable` com `mobileCard` — card no celular, tabela
  no desktop. A página nunca rola na horizontal.
- **Card dentro de card é proibido.** Bloco interno é chapado:
  `rounded-lg bg-muted`, sem borda e sem sombra.
- **Busca e ações ficam fora do card da lista** — elas comandam a lista.
- **Âmbar é da ação e do foco.** Nunca em aba selecionada, passo atual, ícone
  decorativo ou borda de card: o botão âmbar costuma estar na mesma dobra, e
  dois âmbares fazem ele deixar de saltar. Seleção se marca por degrau de tom.
- **Cor sai de token** (`bg-card`, `bg-muted`, `text-muted-foreground`) — nunca
  `#hex`, nunca `bg-sky-500` solto fora de estado semântico.
- **Toda sobreposição é `Dialog`** — inclusive câmera, visor e bloqueio de
  espera. Overlay próprio (`fixed inset-0`) sempre diverge em raio, rolagem e X.
- **Controle segmentado**: `Tabs` quando troca o conteúdo, `SegmentedFilter`
  quando filtra a mesma lista. Nunca desenhe o trilho à mão.
- Testar em **375px** de largura, **nos dois temas**.

## Formulário

Use `FormDialog` (`@/components/ui/form-dialog`): ele já cuida da rolagem em tela
pequena, do rodapé (uma linha, botões nas pontas, em qualquer viewport) e do
estado "salvando".

```tsx
<FormDialog
  open={aberto} onOpenChange={setAberto}
  title="Nova coisa" description="Explique o efeito, não o campo"
  submitLabel="Cadastrar coisa" saving={salvar.isPending}
  onSubmit={() => salvar.mutate(form)}
>
  <div className="space-y-2">
    <Label htmlFor="nome">Nome</Label>              {/* Label já é txt-corpo */}
    <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
  </div>
</FormDialog>
```

Referência pronta: `web/src/components/vagas/VagaFormDialog.tsx`.

## Dados e erros

- `useQuery` / `useMutation` do react-query; chamada sempre pelo `api` de
  `@/api/client` (ele já manda o token e o `X-Tenant-Id`).
- Depois de gravar: `queryClient.invalidateQueries({ queryKey: [...] })`.
- Erro: `toast.error(mensagemErro(err, 'Não foi possível ...'))`.
- Tipos em `web/src/api/types.ts`, espelhando o que o backend devolve.

## Acesso

- Rota em `App.tsx` com `<ProtectedRoute allowedRoles={[...]} requiresModule="...">`.
- Item em `NAV_ITEMS` (`Layout.tsx`) com os **mesmos** perfis da rota.
- Precisa do condomínio ativo? A administradora sem condomínio escolhido é
  mandada para `/meus-condominios` automaticamente — só marque `semCondominio`
  em tela que funciona sem condomínio.

## Gráfico na tela

Cor, eixo, grade e ponta de barra saem de `lib/graficos.ts` — nenhum hexadecimal
na tela. Antes da cor, confira a **forma**: só empilhe o que soma um todo real
(subconjunto com o conjunto, ou contagens de datas diferentes, não somam), e
fluxo não divide eixo com estoque. Para mudar paleta, rode o validador da skill
`dataviz`.

## Fechar

1. `cd web && npx tsc --noEmit -p tsconfig.json && npx vite build`.
2. Rode o checklist do catálogo (`web/src/components/ui/CLAUDE.md`, seção
   "Antes de abrir o PR").
3. Atualize `web/src/CLAUDE.md` (tela nova, hook novo) e, se criou peça
   reutilizável, o catálogo + a tabela de peças do `CLAUDE.md` raiz.
4. `npm run versao correcao` e a linha no `CHANGELOG.md`, no mesmo commit.
