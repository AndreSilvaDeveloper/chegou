# Módulo: Admin (plataforma)

Rotas do **superadmin**: os condomínios da plataforma e a gestão de dentro de
qualquer um deles (suporte).

Todas as rotas aqui são `@Roles('superadmin')`.

## Controllers

### `AdminController` — `/admin/tenants`
`GET /` (com contagem de usuários) · `GET /:id` · `POST /` (cria condomínio +
primeiro síndico) · `PATCH /:id` (cadastro, plano, `ativo`, `config_json`).

### `AdminTenantManagementController` — `/admin/tenants/:tenantId/...`
Usuários, apartamentos e moradores de um condomínio específico. **É por aqui que
o superadmin enxerga dado de condomínio** — ele não entra pelas rotas normais
(`/apartamentos` e afins não o listam em `@Roles`).

> **O WhatsApp não mora mais aqui.** O painel consolidado `/admin/whatsapp`
> deixou de existir: sessão, modelos e ritmo são de **um** condomínio de cada
> vez, em `/admin/tenants/:tenantId/whatsapp` — controller
> `AdminTenantWhatsappController`, no [módulo OpenWA](../openwa/CLAUDE.md), ao
> lado do serviço que opera a sessão. Mesma coisa para a assinatura de um
> condomínio: `/admin/assinaturas/condominios/:tenantId`, no
> [módulo Assinaturas](../assinaturas/CLAUDE.md).

## Regras de negócio

1. **Criar condomínio cria o primeiro síndico** na mesma operação: condomínio sem
   ninguém para entrar não serve para nada.
2. **`administradoraId` nunca vem do corpo** — quem chama decide. O superadmin
   escolhe a carteira pelas rotas de administradoras; a administradora só cria
   dentro da própria.
3. **Merge de `config_json` ignora `undefined`.** O `class-transformer`
   materializa todo campo declarado no DTO, inclusive os que não vieram; espalhar
   o DTO cru apagaria configuração já salva (o JSONB descarta chave `undefined`).
4. **Salvar config invalida os caches** de `TenantConfigService` (módulos) e
   `TenantScopeService` (ativo/carteira) — ligar um módulo precisa valer na
   próxima request, não depois do TTL.
5. **Superadmin não cria `admin` dentro de condomínio** (`ROLES_SUPERADMIN` =
   porteiro, síndico). Acesso de administradora nasce em
   `/admin/administradoras/:id/usuarios`.
6. Provisionamento de WhatsApp na criação é best-effort — gateway fora não
   impede o cadastro.

## Frontend

`web/src/pages/SuperAdmin.tsx` (lista de condomínios) e `SuperAdminTenant.tsx`
(um condomínio, em sete abas: dados, config, unidades, moradores, equipe,
assinatura e WhatsApp). As duas últimas abas são os painéis compartilhados
`components/condominio/AssinaturaCondominioPanel.tsx` e
`WhatsappCondominioPanel.tsx` — os mesmos que a administradora usa em
`MeuCondominio.tsx`, trocando só o `basePath` e o `podeEditar`.

## Ao alterar este módulo

- [ ] Config nova do condomínio → `ConfigTenantDto` + `DEFAULT_TENANT_CONFIG` +
      tela de configurações + invalidação de cache. **Decida também se a
      administradora edita**: se sim, declare em
      `ConfigOperacionalCondominioDto` (módulo Administradoras) e acrescente na
      tela `MeuCondominio.tsx`; se não, mostre de leitura lá.
- [ ] Módulo opcional novo → `TenantModule` (decorator), `MODULE_CONFIG_KEY`
      (`tenant-config.service.ts`), `MODULE_KEY` no front e o toggle no
      `SuperAdminTenant`.
