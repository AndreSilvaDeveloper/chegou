# Módulo: Administradoras

A empresa que administra uma carteira de condomínios. Introduz o papel `admin`
(administradora), que **não pertence a um condomínio** e opera dentro dos
condomínios da carteira escolhendo um por request.

## Rotas e perfis

### Superadmin — `/admin/administradoras`

| Rota | O que faz |
|---|---|
| `GET /` | Lista com contagem de condomínios e acessos |
| `POST /` | Cria a administradora |
| `GET /:id` | Detalhe + carteira + acessos |
| `PATCH /:id` | Dados cadastrais e `ativo` |
| `GET /condominios-sem-carteira` | Condomínios ainda sem administradora |
| `GET/POST /:id/condominios` | Lista / cria condomínio já na carteira |
| `POST /:id/condominios/vincular` | Move condomínio existente para a carteira |
| `DELETE /:id/condominios/:tenantId` | Tira da carteira (não apaga o condomínio) |
| `GET/POST /:id/usuarios`, `DELETE /:id/usuarios/:userId` | Acessos da administradora |

### Administradora — `/minha-administradora`

| Rota | O que faz |
|---|---|
| `GET /` | Dados da própria administradora |
| `GET /condominios` | A carteira |
| `GET /condominios/:tenantId` | Um condomínio da carteira (404 se for de outra) |
| `POST /condominios` | Cria condomínio na própria carteira, com o primeiro síndico |
| `PATCH /condominios/:tenantId` | Cadastro **e** configuração operacional do condomínio |
| `GET /usuarios` | Acessos da própria administradora |

**Nenhuma rota de `/minha-administradora` recebe o id da carteira** — ele vem do
usuário logado (`@AdministradoraId()`). Não existe id para adulterar na URL.

## Dados

- `administradoras`: `nome`, `cnpj` (único quando preenchido), contatos, `ativo`
- `tenants.administradora_id`: NULL = condomínio direto com o superadmin
- `users.administradora_id`: preenchido só para `role = 'admin'`

FKs com `ON DELETE RESTRICT`: apagar administradora com carteira ou acessos é
erro. O caminho é desativar (`ativo = false`), como no resto do sistema.

## Regras de negócio

1. **A carteira é a fronteira.** Todo método que recebe `administradoraId` busca
   amarrando a ela — a administradora não consegue nem confirmar que existe um
   condomínio de outra (404, não 403).
2. **A administradora configura o operacional** dos condomínios dela; o
   comercial é da plataforma. Ver "O que ela configura" abaixo.
3. **Papel não vem do corpo.** `POST /:id/usuarios` cria sempre `role = 'admin'`;
   é isso que impede a rota de virar atalho para criar superadmin.
4. **Administradora desativada não cria condomínio.**
5. Vincular/desvincular condomínio **invalida o cache do escopo**
   (`TenantScopeService.invalidate`) — sem isso o acesso concedido só valeria
   depois do TTL.

## O que ela configura num condomínio

`PATCH /minha-administradora/condominios/:tenantId` — cadastro (nome, CNPJ,
cidade, UF, endereço, contatos) e, em `configJson`, **só o operacional**:

| Campo | Quem edita | Por quê |
|---|---|---|
| `tipo`, `estruturaBlocos` | administradora | Descrevem como o condomínio é |
| `horarioEnvioInicio` / `Fim` | administradora, **dentro de 08:00–21:00** | Mesma faixa da tela `/whatsapp` |
| `moduloVagas`, `moduloAvisos` | só superadmin | São o que foi **contratado** |
| `plano`, `ativo`, `slug` | só superadmin | Decisão comercial da plataforma |

**`ativo` é o que mais importa manter fora.** A assinatura conta apartamento
ativo **de condomínio ativo**: dar esse botão a quem paga a fatura seria dar o
botão de baixar a própria conta.

A recusa não é silenciosa — `ConfigOperacionalCondominioDto` não declara os
campos vedados, e o `forbidNonWhitelisted` do `ValidationPipe` responde **400**.
É a garantia mais forte que existe aqui: não depende de ninguém lembrar de
filtrar. Os oito casos estão em `test/multitenant.e2e-spec.ts`.

Duas armadilhas no merge (`mesclarConfigOperacional`):

1. **Chave `undefined` fica de fora.** O `class-transformer` materializa todo
   campo do DTO, mesmo os que não vieram; espalhar o DTO cru apagaria os modelos
   de mensagem e os módulos, porque o JSONB descarta `undefined`. Mesma regra do
   `AdminService`.
2. **A janela é validada como par**, no service. Cada horário sozinho já passa
   no regex do DTO; quem diz se a janela é válida são os dois juntos — e ela
   precisa caber na faixa anti-bloqueio. Sem essa checagem, esta rota seria o
   caminho alternativo para enviar de madrugada.

Salvar `configJson` **invalida o `TenantConfigService`**: `estruturaBlocos`
decide se o cadastro de unidade exige bloco, e sem invalidar a mudança só valeria
depois do TTL.

## Frontend

- `web/src/pages/MeusCondominios.tsx` — carteira da administradora; é a tela
  onde ela escolhe em qual condomínio entrar.
- `web/src/pages/MeuCondominio.tsx` — configurar um condomínio da carteira
  (`/meus-condominios/:id`), com as mesmas cinco abas do `SuperAdminTenant`. As
  peças visuais das duas são as de `components/condominio/condominio-shared.tsx`.

> **Abrir a tela de configuração entra no condomínio.** As abas de Unidades,
> Moradores e Acessos reaproveitam os managers com `basePath=""`, que caem nas
> rotas normais do condomínio e resolvem o escopo pelo `X-Tenant-Id`. Por isso a
> página só monta o conteúdo depois que o condomínio do `:id` virou o ativo —
> efeito de filho roda antes do efeito do pai, então renderizar junto com a troca
> mostraria dado do condomínio anterior sob o nome deste. As duas rotas de
> `/meus-condominios` são `semCondominio`.
- `web/src/pages/SuperAdminAdministradoras.tsx` — gestão pelo superadmin.
- Trocar de condomínio: `useTrocarCondominio()` em
  `web/src/hooks/use-tenant-config.ts` (limpa o cache do react-query).

## Ao alterar este módulo

- [ ] Rota nova em `/minha-administradora`? O id da carteira vem de
      `@AdministradoraId()`, **nunca** da URL.
- [ ] Mexeu no vínculo condomínio ↔ carteira? Chame
      `TenantScopeService.invalidate(tenantId)`.
- [ ] Ampliou o que a administradora pode fazer? Atualize a tabela de perfis do
      `CLAUDE.md` raiz e acrescente o caso em `test/multitenant.e2e-spec.ts`.
- [ ] Campo novo em `configJson` que ela possa editar? Declare no
      `ConfigOperacionalCondominioDto` — e só se não for decisão comercial.
      Pergunte antes: o critério é "descreve o condomínio" vs. "descreve o
      contrato".
- [ ] Mexeu nos testes de configuração? Eles usam **`condA2`** de propósito:
      `condA1` tem o teste de módulo não contratado, e ligar Vagas nele o
      derruba.
