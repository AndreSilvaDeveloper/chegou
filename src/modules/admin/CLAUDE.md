# Módulo: Admin (plataforma)

Rotas do **superadmin**: os condomínios da plataforma e a gestão de dentro de
qualquer um deles (suporte).

Todas as rotas aqui são `@Roles('superadmin')`.

## Controllers

### `AdminController` — `/admin/tenants`
`GET /` (com contagem de usuários) · `GET /:id` · `POST /` (cria condomínio +
primeiro síndico) · `PATCH /:id` (cadastro, contatos, **endereço completo**,
plano, `ativo`, `config_json`).

**O `POST` exige cadastro completo**: nome, documento, e-mail e telefone do
condomínio, o endereço (CEP, logradouro, número, cidade e UF — complemento e
bairro seguem livres) e o síndico com telefone. O `slug` **não** é pedido. A
tela correspondente é o wizard de três passos
(`web/src/components/condominio/CondominioWizard.tsx`), usado também pela
administradora.

> **O endereço entrou tarde aqui, e isso doía.** Até a migration 035 o `PATCH`
> desta rota só aceitava cidade e UF — então quando a cobrança de um cliente
> falhava por endereço incompleto, quem tinha de consertar era o próprio
> cliente: justamente quem abriu o chamado. Hoje os sete campos vêm de
> `EnderecoDto` (`src/common/endereco.dto.ts`), o mesmo das rotas do síndico e
> da administradora. O `POST` continua pedindo só cidade e UF: endereço de
> condomínio é preenchimento incremental, e travar a criação nele atrasaria o
> cadastro sem necessidade.

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
1.1. **O `slug` é gerado pelo servidor, não digitado.** Ele é o nome da sessão do
   condomínio no gateway de WhatsApp (`{OPENWA_SESSION_PREFIX}-{slug}`), então
   não se troca depois — e quem sabe se ele está livre é o banco, não a tela.
   `baseDeSlug()` (`src/common/slug.ts`) tira acento, número e caractere
   especial do nome; `slugUnico()` confere os vizinhos numa consulta só e
   acrescenta um sufixo de **letras** quando já existe. O campo continua aceito
   no corpo para migração de dado, e só o slug **gerado** é resorteado no retry:
   forçar outro por cima de um slug pedido explicitamente criaria um condomínio
   diferente do pedido.
1.2. **O retry olha a constraint, não só o código do erro.** `23505` cobre slug,
   documento e e-mail do síndico; sem conferir `tenants_slug_key`, um CNPJ
   repetido faria o slug ser trocado à toa e o segundo erro seria idêntico ao
   primeiro. Duas voltas no máximo — a checagem e o INSERT não são atômicos, mas
   mais que isso é sinal de que o conflito não era o slug.
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
- [ ] Campo novo **obrigatório** no `CriarTenantDto`? Ele quebra os fixtures de
      e2e — acrescente em `test/helpers/condominio.ts`, que é de onde os três
      pontos de criação tiram o corpo. E confira se há onde **editá-lo** depois:
      exigir na criação sem oferecer no `PATCH` deixa o conserto de um erro de
      digitação para o banco.
