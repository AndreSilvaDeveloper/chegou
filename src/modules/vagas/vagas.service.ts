import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vaga } from '../../database/entities';
import { CriarVagaDto } from './dto/criar-vaga.dto';
import { AtualizarVagaDto } from './dto/atualizar-vaga.dto';

@Injectable()
export class VagasService {
  constructor(
    @InjectRepository(Vaga)
    private repo: Repository<Vaga>,
  ) {}

  async listar(tenantId: string) {
    return this.repo.find({
      where: { tenantId },
      order: { numero: 'ASC' },
      relations: ['apartamento'],
    });
  }

  async obter(tenantId: string, id: string) {
    const vaga = await this.repo.findOne({
      where: { tenantId, id },
      relations: ['apartamento'],
    });
    if (!vaga) throw new NotFoundException('Vaga não encontrada');
    return vaga;
  }

  async criar(tenantId: string, dto: CriarVagaDto) {
    const existe = await this.repo.findOneBy({ tenantId, numero: dto.numero });
    if (existe) throw new ConflictException('Já existe uma vaga com esse número');

    const vaga = this.repo.create({ ...dto, tenantId });
    return this.repo.save(vaga);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarVagaDto) {
    const vaga = await this.obter(tenantId, id);

    if (dto.numero && dto.numero !== vaga.numero) {
      const existe = await this.repo.findOneBy({ tenantId, numero: dto.numero });
      if (existe) throw new ConflictException('Já existe uma vaga com esse número');
    }

    Object.assign(vaga, dto);
    // Para limpar o relacionamento
    if (dto.apartamentoId === null) {
      vaga.apartamentoId = null;
    }
    
    return this.repo.save(vaga);
  }

  async desativar(tenantId: string, id: string) {
    const vaga = await this.obter(tenantId, id);
    vaga.ativo = false;
    await this.repo.save(vaga);
    return { success: true };
  }
}
