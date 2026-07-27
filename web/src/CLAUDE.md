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

## Padrões de tela

| Situação | Use |
|---|---|
| Carregando | `Skeleton` (nunca o texto "Carregando…") |
| Lista vazia | `EmptyState` com ação |
| Formulário | `FormDialog` (`components/ui/form-dialog.tsx`) |
| Ação destrutiva | `ConfirmDialog` (nunca `confirm()`) |
| Indicador numérico | `StatCard` |
| Select | `SimpleSelect` |
| Select com lista grande | `SearchSelect` (busca por digitação; use `onSearchChange` para buscar no servidor) |
| Telefone | `PhoneInput` — digita `(32) 99999-9999`, entrega E.164. **Nunca peça `+55`** |
| Telefone em listagem | `formatarTelefone()` de `@/lib/telefone` |
| Erro de request | `toast.error(mensagemErro(err, 'Não foi possível …'))` |
| Dinheiro, data, competência | `fmtMoeda` / `fmtData` / `fmtCompetencia` de `@/lib/formato` |

Regras fixas: mobile-first (base = celular, `sm:`/`md:` amplia), `min-h-[48px]`
em botão de ação, ícone **sempre** com texto, `Label` sempre visível, ícones só
do Lucide, dark mode em tudo, testar em 375px.

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
- [ ] Campo novo vindo da API → atualize `api/types.ts`.
- [ ] Componente reaproveitável → `components/ui/` e registre em "Peças
      reutilizáveis" no `CLAUDE.md` raiz.
- [ ] Rodar `npx tsc --noEmit -p tsconfig.json` e `npx vite build`.
- [ ] Atualizar esta doc e a do módulo correspondente no backend.
