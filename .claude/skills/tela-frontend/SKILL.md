---
name: tela-frontend
description: Cria página ou diálogo no painel do Chegou seguindo os padrões do projeto — mobile-first para o porteiro, shadcn/ui, react-query, FormDialog, controle de acesso por perfil e módulo, e atualização da doc do frontend. Use ao criar ou reformular tela do web/.
---

# Tela nova no painel

Quem mais usa o sistema é o porteiro, muitas vezes pessoa mais velha, no celular,
em pé na portaria. Todo padrão abaixo existe por causa disso.

Antes: rode o fluxo da skill `funcionalidade-nova` (perfis de acesso).

## Anatomia de uma página

```tsx
export function MinhaTela() {
  const query = useQuery({ queryKey: ['coisas'], queryFn: () => api.get<Coisa[]>('/coisas') });

  return (
    <div className="space-y-6 pb-10">
      <PageHeader icon={Algo} eyebrow="Área" title="Título" description="O que é">
        <Button className="min-h-[48px] w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Ação principal
        </Button>
      </PageHeader>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />       // nunca "Carregando..."
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState icon={Algo} title="Nada por aqui" description="..." actionLabel="Criar" onAction={...} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">...</div>
      )}
    </div>
  );
}
```

## Regras que não se negociam

- **Mobile-first**: estilo base é o do celular; `sm:`/`md:` só para ampliar.
  Grid começa em `grid-cols-1`. Botão começa em `w-full`, vira `sm:w-auto`.
- **Toque de 48px**: `min-h-[48px]` em botão e link de ação.
- **Ícone sempre com texto** — nunca ícone sozinho, nunca emoji como ícone.
- **Label sempre visível** (`<Label htmlFor>`), placeholder é exemplo, não rótulo.
- **`Skeleton`** no carregamento, `EmptyState` no vazio.
- **Ação destrutiva** passa por `ConfirmDialog` — nunca `confirm()` nativo.
- **Tabela larga**: vira card no celular ou rola dentro de um container próprio.
  A página nunca rola na horizontal.
- Testar em **375px** de largura.

## Formulário

Use `FormDialog` (`@/components/ui/form-dialog`): ele já cuida de rolagem em tela
pequena, botões empilhados no celular, alvo de toque e estado "salvando".

```tsx
<FormDialog
  open={aberto} onOpenChange={setAberto}
  title="Nova coisa" description="Explique o efeito, não o campo"
  submitLabel="Cadastrar coisa" saving={salvar.isPending}
  onSubmit={() => salvar.mutate(form)}
>
  <div className="space-y-2">
    <Label htmlFor="nome" className="text-base">Nome</Label>
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

## Fechar

`cd web && npx tsc --noEmit -p tsconfig.json && npx vite build` e atualize
`web/src/CLAUDE.md` (tela nova, componente novo, hook novo).
