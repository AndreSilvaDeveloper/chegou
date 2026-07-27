# Módulo: Admin (plataforma)

Rotas do **superadmin**: os condomínios da plataforma, a gestão de dentro de
qualquer um deles (suporte) e a visão consolidada do WhatsApp.

Todas as rotas aqui são `@Roles('superadmin')`.

## Controllers

### `AdminController` — `/admin/tenants`
`GET /` (com contagem de usuários) · `GET /:id` · `POST /` (cria condomínio +
primeiro síndico) · `PATCH /:id` (cadastro, plano, `ativo`, `config_json`).

### `AdminTenantManagementController` — `/admin/tenants/:tenantId/...`
Usuários, apartamentos e moradores de um condomínio específico. **É por aqui que
o superadmin enxerga dado de condomínio** — ele não entra pelas rotas normais
(`/apartamentos` e afins não o listam em `@Roles`).

### `AdminWhatsappController` — `/admin/whatsapp`
Panorama das sessões, provisionamento em lote e ajuste por condomínio (ritmo de
envio + os dois modelos de mensagem, chegada e retirada). **É o mesmo dado que o
síndico edita em `/whatsapp`** — modelo novo precisa aparecer nas duas telas.

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

`web/src/pages/SuperAdmin.tsx` (lista de condomínios),
`SuperAdminTenant.tsx` (um condomínio: dados, config, módulos, cadastros),
`AdminWhatsapp.tsx`.

## Ao alterar este módulo

- [ ] Config nova do condomínio → `ConfigTenantDto` + `DEFAULT_TENANT_CONFIG` +
      tela de configurações + invalidação de cache. **Decida também se a
      administradora edita**: se sim, declare em
      `ConfigOperacionalCondominioDto` (módulo Administradoras) e acrescente na
      tela `MeuCondominio.tsx`; se não, mostre de leitura lá.
- [ ] Módulo opcional novo → `TenantModule` (decorator), `MODULE_CONFIG_KEY`
      (`tenant-config.service.ts`), `MODULE_KEY` no front e o toggle no
      `SuperAdminTenant`.
