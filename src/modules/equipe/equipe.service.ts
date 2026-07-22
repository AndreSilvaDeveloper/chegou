import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funcionario } from '../../database/entities';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto';
import { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto';

@Injectable()
export class EquipeService {
  constructor(
    @InjectRepository(Funcionario)
    private repo: Repository<Funcionario>,
  ) {}

  async listar(tenantId: string) {
    return this.repo.find({
      where: { tenantId },
      order: { nome: 'ASC' },
      relations: ['user'],
    });
  }

  async obter(tenantId: string, id: string) {
    const func = await this.repo.findOne({
      where: { tenantId, id },
      relations: ['user'],
    });
    if (!func) throw new NotFoundException('Funcionário não encontrado');
    return func;
  }

  async criar(tenantId: string, dto: CriarFuncionarioDto) {
    const func = this.repo.create({ ...dto, tenantId });
    return this.repo.save(func);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarFuncionarioDto) {
    const func = await this.obter(tenantId, id);

    Object.assign(func, dto);

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
