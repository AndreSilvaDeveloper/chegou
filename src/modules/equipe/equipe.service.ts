import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funcionario, User } from '../../database/entities';
import { assertRefDoTenant } from '../../common/tenant-scope/tenant-ref';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto';
import { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto';

@Injectable()
export class EquipeService {
  constructor(
    @InjectRepository(Funcionario)
    private repo: Repository<Funcionario>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * O login vinculado ao funcionário precisa ser do mesmo condomínio.
   *
   * Sem esta checagem, mandar o `userId` de outro condomínio no corpo vazaria
   * nome e e-mail daquele usuário na listagem da equipe (que traz a relação).
   */
  private async assertUserDoTenant(tenantId: string, userId: string): Promise<void> {
    await assertRefDoTenant(
      this.userRepo,
      tenantId,
      userId,
      'Usuário não encontrado neste condomínio',
    );
  }

  async listar(tenantId: string) {
    return this.repo.find({
      where: { tenantId },
      order: { nome: 'ASC' },
      relations: { user: true },
    });
  }

  async obter(tenantId: string, id: string) {
    const func = await this.repo.findOne({
      where: { tenantId, id },
      relations: { user: true },
    });
    if (!func) throw new NotFoundException('Funcionário não encontrado');
    return func;
  }

  async criar(tenantId: string, dto: CriarFuncionarioDto) {
    if (dto.userId) await this.assertUserDoTenant(tenantId, dto.userId);
    const func = this.repo.create({ ...dto, tenantId });
    return this.repo.save(func);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarFuncionarioDto) {
    const func = await this.obter(tenantId, id);
    if (dto.userId) await this.assertUserDoTenant(tenantId, dto.userId);

    Object.assign(func, dto);
    // `tenantId` nunca vem do corpo, mas o Object.assign acima é genérico —
    // reafirmar aqui garante que nenhum campo novo do DTO mude o dono do registro.
    func.tenantId = tenantId;

    // Permite setar null explicitamente
    if (dto.userId === null) func.userId = null;
    if (dto.telefone === null) func.telefone = null;
    if (dto.email === null) func.email = null;
    if (dto.documento === null) func.documento = null;
    if (dto.dataAdmissao === null) func.dataAdmissao = null;
    if (dto.horarioTrabalho === null) func.horarioTrabalho = null;
    if (dto.observacoes === null) func.observacoes = null;

    return this.repo.save(func);
  }

  async desativar(tenantId: string, id: string) {
    const func = await this.obter(tenantId, id);
    func.ativo = false;
    await this.repo.save(func);
    return { success: true };
  }
}
