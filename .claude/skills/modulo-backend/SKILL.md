---
name: modulo-backend
description: Cria um módulo NestJS novo no Chegou seguindo o padrão do projeto — entidade, migration SQL, DTOs validados, service isolado por condomínio, controller com perfis de acesso e o CLAUDE.md do módulo. Use ao adicionar uma área de domínio nova no backend.
---

# Módulo novo no backend

Antes de começar, rode o fluxo da skill `funcionalidade-nova` (perfis de acesso).
Aqui está só a estrutura.

## Estrutura

```
src/modules/<modulo>/
├── CLAUDE.md                 # doc do módulo — criada JUNTO, não depois
├── <modulo>.module.ts
├── <modulo>.controller.ts
├── <modulo>.service.ts
└── dto/
    ├── criar-<coisa>.dto.ts
    └── atualizar-<coisa>.dto.ts
```

Entidade fica em `src/database/entities/` (centralizada, nunca duplicada) e é
exportada no `index.ts` de lá — o `DatabaseModule` registra `Object.values`, então
esse index só pode exportar classes de entidade.

## 1. Migration

```sql
-- db/migrations/0NN_create_<tabela>.sql
CREATE TABLE <tabela> (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ... colunas do domínio, snake_case
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_<tabela>_tenant ON <tabela>(tenant_id);

CREATE TRIGGER trg_<tabela>_updated_at
BEFORE UPDATE ON <tabela>
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Regras: `timestamptz` sempre; soft delete por `ativo`; CHECK para enum de texto;
índice parcial quando houver regra de unicidade condicional.

Rodar: `npm run db:migrate` (precisa de `DATABASE_URL`).

## 2. Service — o condomínio entra em toda query

```ts
async listar(tenantId: string) {
  return this.repo.find({ where: { tenantId }, order: { nome: 'ASC' } });
}

async obter(tenantId: string, id: string) {
  const item = await this.repo.findOne({ where: { id, tenantId } }); // os DOIS
  if (!item) throw new NotFoundException('<Coisa> não encontrada');
  return item;
}

async criar(tenantId: string, dto: CriarCoisaDto) {
  if (dto.apartamentoId) {
    await assertRefDoTenant(this.aptoRepo, tenantId, dto.apartamentoId,
      'Apartamento não encontrado neste condomínio');
  }
  return this.repo.save(this.repo.create({ ...dto, tenantId })); // tenantId por último
}
```

## 3. Controller — perfis explícitos

```ts
@Controller('<rota>')
@RequiresModule('<modulo>')          // só se for módulo opcional
export class CoisasController {
  @Get()
  @Roles('admin', 'sindico', 'porteiro')   // combinado com o usuário
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }
}
```

Rota fixa (`@Get('resumo')`) **antes** da curinga (`@Get(':id')`), senão o
curinga engole.

## 4. Registrar

- `TypeOrmModule.forFeature([...])` no módulo, com toda entidade que o service usa.
- Módulo no `imports` do `AppModule`.
- Suba a API e confirme no log que as rotas foram mapeadas.

## 5. Documentar

Crie o `CLAUDE.md` do módulo com a estrutura das docs existentes (veja
`src/modules/vagas/CLAUDE.md` como referência): propósito, rotas + perfis,
dados, regras de negócio, decisões/armadilhas e "Ao alterar este módulo".
Adicione a linha do módulo na tabela de módulos do `CLAUDE.md` raiz.
