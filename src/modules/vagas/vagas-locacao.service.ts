import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VagaLocacao } from '../../database/entities';
import { StatusLocacao } from '../../database/entities/vaga-locacao.entity';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { AtualizarLocacaoDto } from './dto/atualizar-locacao.dto';

@Injectable()
export class VagasLocacaoService {
  constructor(
    @InjectRepository(VagaLocacao)
    private repo: Repository<VagaLocacao>,
  ) {}

  async listar(tenantId: string) {
    return this.repo.find({
      where: { tenantId },
      relations: ['vaga', 'morador', 'vaga.apartamento'],
      order: { createdAt: 'DESC' },
    });
  }

  async obter(tenantId: string, id: string) {
    const locacao = await this.repo.findOne({
      where: { tenantId, id },
      relations: ['vaga', 'morador'],
    });
    if (!locacao) throw new NotFoundException('Locação não encontrada');
    return locacao;
  }

  async criar(tenantId: string, dto: CriarLocacaoDto) {
    const locacao = this.repo.create({ ...dto, tenantId });
    return this.repo.save(locacao);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarLocacaoDto) {
    const locacao = await this.obter(tenantId, id);

    Object.assign(locacao, dto);

    // Permitir limpar relacionamentos explicitamente se passados como null
    if (dto.moradorId === null) locacao.moradorId = null;
    if (dto.dataFim === null) locacao.dataFim = null;

    return this.repo.save(locacao);
  }

  async encerrar(tenantId: string, id: string) {
    const locacao = await this.obter(tenantId, id);
    locacao.status = StatusLocacao.ENCERRADA;
    locacao.dataFim = new Date().toISOString().split('T')[0];
    await this.repo.save(locacao);
    return { success: true };
  }
}
