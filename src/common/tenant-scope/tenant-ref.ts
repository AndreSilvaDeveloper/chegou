import { BadRequestException } from '@nestjs/common';
import { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

/**
 * Garante que um id vindo do corpo da request é do condomínio da request.
 *
 * É o furo clássico do multitenant: a rota já está isolada, mas o DTO carrega o
 * id de um registro relacionado (apartamento, morador, usuário, vaga...) e
 * ninguém confere de quem ele é. O resultado vai de dado de outro condomínio
 * aparecendo numa listagem (quando a relação é carregada) a operação silenciosa
 * que não faz nada.
 *
 * Use SEMPRE que um DTO tiver um campo `algumaCoisaId`.
 *
 * ```ts
 * if (dto.apartamentoId) {
 *   await assertRefDoTenant(this.aptoRepo, tenantId, dto.apartamentoId,
 *     'Apartamento não encontrado neste condomínio');
 * }
 * ```
 */
export async function assertRefDoTenant<T extends ObjectLiteral>(
  repo: Repository<T>,
  tenantId: string,
  id: string,
  mensagem: string,
  filtroExtra?: FindOptionsWhere<T>,
): Promise<void> {
  // O cast é necessário porque o helper é genérico: quem chama garante que a
  // entidade tem `id` e `tenantId` (todas as entidades de condomínio têm).
  const where = { ...(filtroExtra ?? {}), id, tenantId } as unknown as FindOptionsWhere<T>;
  const existe = await repo.exists({ where });
  if (!existe) throw new BadRequestException(mensagem);
}
