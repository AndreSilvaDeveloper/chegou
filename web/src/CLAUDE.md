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
├── lib/                # utils (cn) e erros (mensagemErro)
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
- Sem condomínio escolhido, o `ProtectedRoute` manda a administradora para a
  carteira. Só rota marcada com `semCondominio` escapa disso.
- Trocar de condomínio (`useTrocarCondominio`) **limpa o cache do react-query** —
  mostrar dado de um condomínio sob o nome de outro é pior que recarregar.

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

Regras fixas: mobile-first (base = celular, `sm:`/`md:` amplia), `min-h-[48px]`
em botão de ação, ícone **sempre** com texto, `Label` sempre visível, ícones só
do Lucide, dark mode em tudo, testar em 375px.

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
