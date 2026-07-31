---
name: tela-listagem
description: Monta ou converte uma tela de listagem/cadastro do Chegou no layout padrão — faixa âmbar no celular com título, busca e filtros; cabeçalho comum no desktop; registros como card no mobile e tabela no desktop. Use ao criar uma tela de lista (apartamentos, moradores, equipe, vagas…) ou ao adaptar uma tela antiga ao padrão.
---

# Layout de tela de listagem/cadastro

Toda tela que **lista registros e permite cadastrar** usa esta casca. Ela existe
para as telas serem irmãs: quem aprendeu Apartamentos sabe usar Moradores.

Referência pronta e completa: `web/src/components/ApartamentosManager.tsx`.

## O desenho

```
──────────── CELULAR (< 768px) ────────────
┌───────────────────────────────┐
│▓▓ [≡]  🏢 Residencial Bela  (JO)│ ← Layout.tsx (barra do topo)
│▓▓                              │
│▓▓ Apartamentos                 │ ← PageShell (título)
│▓▓ Unidades do condomínio…      │
│▓▓ [🔍 Buscar…          ] [⚙]   │ ← PageShell (busca + filtro)
│╭──────────────────────────────╮│
││ [Importar CSV] [+ Novo]      ││ ← folha branca sobe por cima
││ 20 unidades cadastradas      ││
││ ╭──────────────────────────╮ ││
││ │ 🏢 A-101      [A]  ✏️ 🗑️ │ ││ ← ListCard
││ │ BLOCO      NÚMERO        │ ││
││ │ A          101           │ ││
││ ╰──────────────────────────╯ ││
```

```
──────────── DESKTOP (≥ 768px) ────────────
┌────────┬──────────────────────────────────┐
│sidebar │                            (JO)  │
│        │ CONDOMÍNIO                       │
│        │ Apartamentos                     │
│        │ Unidades do condomínio…          │
│        │ [🔍 Buscar…      ] [⚙]           │
│        │ [Importar CSV] [+ Novo]          │
│        │ ┌──────────────────────────────┐ │
│        │ │ Unidade │ Bloco │ Nº │ ações │ │ ← tabela
```

**A faixa âmbar é só do celular.** No desktop a sidebar já dá a identidade, e um
bloco âmbar daquela largura viraria a coisa mais pesada da tela.

## Como montar

```tsx
export function CoisasManager({ basePath = '', embutido = false }) {
  const [search, setSearch] = useState('');
  const [filtroX, setFiltroX] = useState<string | null>(null);

  return (
    <PageShell
      embutido={embutido}
      icon={IconeDaTela}
      eyebrow="Área"
      title="Coisas"
      description="Uma frase sobre o que a tela resolve."
      busca={{ valor: search, aoMudar: setSearch, placeholder: 'Buscar coisas…' }}
      filtros={<div className="space-y-2">{/* campos da gaveta */}</div>}
      filtrosAtivos={filtroX ? 1 : 0}
      aoLimparFiltros={() => setFiltroX(null)}
      acoes={
        <>
          <Button variant="outline" className="flex-1 rounded-full sm:flex-none">…</Button>
          <Button className="flex-1 rounded-full sm:flex-none">+ Nova coisa</Button>
        </>
      }
    >
      <div className="space-y-4">
        <DataTable columns={columns} data={lista} mobileCard={(c) => <ListCard … />} />
        {/* diálogos de form e de confirmação */}
      </div>
    </PageShell>
  );
}
```

E a **página** fica magra — sem `PageHeader` e sem wrapper com padding, que agora
são responsabilidade do `PageShell`:

```tsx
export function Coisas() {
  return <CoisasManager basePath="" />;
}
```

## As cinco regras que fazem a faixa funcionar

1. **A faixa é uma coisa só, partida em dois arquivos.** A barra com
   menu/condomínio/avatar mora no `Layout`; o título e a busca, no `PageShell`.
   Elas se unem porque o `<main>` do `Layout` **não tem padding nem fundo no
   celular**. Se você puser fundo ali, a faixa parte no meio.
2. **Cor pelo token `banner`, nunca `primary` nem `bg-[#FFC72C]`.** No escuro o
   âmbar puro num bloco desse tamanho vira um holofote — `--banner` fecha para
   `#5C4400` e o texto passa a claro (8:1). O botão de ação continua no `#FFC72C`
   cheio: ali a cor é do tamanho de um botão.
   - fundo da faixa → `bg-banner`
   - texto sobre ela → `text-banner-foreground`
   - controle dentro dela (busca, botão de menu) → `bg-banner-surface`
3. **A folha branca sobe por cima da faixa** (`-mt-4 rounded-t-3xl bg-background`).
   É esse encaixe que dá o ar de app, e não de página.
4. **As ações trocam de lugar.** No celular descem para a folha (há largura para
   os rótulos); no desktop ficam na linha do cabeçalho. O `PageShell` já faz.
5. **Dentro de uma aba, use `embutido`.** Em `/admin/condominios/:id` e
   `/meus-condominios/:id` a listagem é uma aba, não a tela. Sem `embutido`
   apareceria um "Apartamentos" com fundo âmbar no meio da página — cabeçalho de
   tela dentro de outro.

## Botão de filtro: só com gaveta de verdade

`filtros` ausente = botão não aparece. **Nunca deixe o botão sem função** — botão
que não responde ensina o usuário a ignorar a interface.

O que cada tela filtra (mantenha esta lista ao adicionar telas):

| Tela | Filtros | Onde filtra |
|---|---|---|
| Apartamentos | Bloco | Cliente — os blocos já vieram na lista |
| Moradores | Bloco, recebe WhatsApp | Cliente |
| Equipe | Papel, status | Cliente |
| Vagas | Tipo, situação | A situação já são abas |

**Busca e filtro não são a mesma coisa.** Em Apartamentos e Moradores a lista vem
cortada em 50 pelo backend, então a **busca vai ao servidor** (com `useDebounce`)
— filtrar no cliente só enxergaria as 50 primeiras, que é o bug de "501 não
encontrado". O **filtro** age sobre o que já está carregado, e a gaveta diz isso
em letra miúda.

## O card do registro

Use `ListCard`. A anatomia é fixa — é ela que faz as telas parecerem irmãs:

```tsx
<ListCard
  icone={Building2}
  titulo={<span className="font-mono">{a.identificador}</span>}
  selo={a.bloco ? <Badge variant="outline">{a.bloco}</Badge> : undefined}
  acoes={
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${a.identificador}`}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Remover ${a.identificador}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </>
  }
  campos={[
    { rotulo: 'Bloco', valor: a.bloco || '—' },
    { rotulo: 'Número', valor: <span className="font-mono">{a.numero}</span> },
    { rotulo: 'Observações', valor: a.observacoes, largura: 'inteira' },
  ]}
/>
```

- **Rótulo pequeno apagado em cima, valor legível embaixo.** Substitui o cabeçalho
  da tabela; sem ele o card vira valores sem nome.
- **Duas colunas.** `largura: 'inteira'` só para texto longo (e-mail, observação).
- **No máximo 3 ou 4 campos.** O card é uma *escolha* do que importa no celular,
  não a tabela empilhada. Coluna que só existe para ordenar não entra.
- **Botão só de ícone exige `aria-label`** com o nome do registro.

## Checklist antes de dar por pronta

- [ ] Tela em 375px: nada corta, nada rola na horizontal.
- [ ] **Modo escuro**: abrir a tela e conferir a faixa (deve ser âmbar fechado,
      nunca o amarelo puro) e o contraste do título sobre ela.
- [ ] Desktop ≥ 768px: a faixa some, o cabeçalho vira comum, a tabela aparece.
- [ ] Busca funciona de verdade (não é um `<Input>` decorativo) e, onde a lista
      vem cortada pelo backend, vai ao servidor com `useDebounce`.
- [ ] Botão de filtro só existe se a gaveta existe.
- [ ] Se a tela também vive numa aba, `embutido` está sendo passado.
- [ ] Página magra: sem `PageHeader`, sem `<div className="space-y-6 pb-10">`.
- [ ] `npx tsc --noEmit -p tsconfig.json` e `npm run build` na pasta `web/`.
- [ ] Doc do frontend (`web/src/CLAUDE.md`) e versão + CHANGELOG.

## Os quatro tipos de tela

O `PageShell` serve a todas; o que muda é o que se declara.

| Tipo | Declara | Exemplos |
|---|---|---|
| **Listagem** | título, descrição, busca, filtros, ações | Apartamentos, Moradores, Equipe, Encomendas |
| **Painel** | título, descrição, ações (sem busca) | Dashboard, Relatórios, Assinatura, WhatsApp |
| **Detalhe** | título = o registro, `voltar`, sem descrição nem busca | Detalhe da encomenda |
| **Formulário** | título, descrição, `voltar` | Nova encomenda |

**Abas ficam na folha branca**, dentro de `children` — nunca presas à faixa.
A faixa cresceria, e a aba ativa precisaria de tratamento de contraste sobre o
âmbar. Vale para Vagas, Relatórios, Notificações e as telas de configurar
condomínio.

## Telas já convertidas

Todas as telas dentro do `Layout` usam `PageShell`. As de fora — **Login** e
**Autocadastro do morador** (`/cadastro/:token`) — não têm faixa: são públicas e
não têm barra de topo.

| Tela | `voltar` | Busca | Filtros |
|---|:---:|:---:|---|
| Apartamentos | — | ✅ | bloco |
| Moradores | — | ✅ | bloco, recebe WhatsApp |
| Equipe | — | ✅ | papel, status |
| Encomendas | — | ✅ | período (de/até) |
| Detalhe da encomenda | `/encomendas` | — | — |
| Nova encomenda | `/encomendas` | — | — |
| Dashboard, Relatórios, Assinatura, WhatsApp, Filas, Avisos, Vagas | — | — | — |
| Meus condomínios, Administradoras, Assinaturas, Etiquetas, Condomínios | — | — | — |
| Configurar condomínio (carteira) | `/meus-condominios` | — | — |
| Gerenciar condomínio (plataforma) | `/admin` | — | — |
