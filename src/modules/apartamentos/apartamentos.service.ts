import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { AtualizarApartamentoDto } from './dto/atualizar-apartamento.dto';
import { CriarApartamentoDto } from './dto/criar-apartamento.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ApartamentosService {
  constructor(
    @InjectRepository(Apartamento) private readonly aptoRepo: Repository<Apartamento>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
  ) {}

  async listar(tenantId: string, q?: string): Promise<Apartamento[]> {
    const qb = this.aptoRepo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.ativo = true')
      .orderBy('a.identificador', 'ASC')
      .take(50);
    if (q && q.trim()) {
      qb.andWhere('a.identificador ILIKE :q', { q: `%${q.trim()}%` });
    }
    return qb.getMany();
  }

  async obter(tenantId: string, id: string): Promise<Apartamento> {
    const apto = await this.aptoRepo.findOne({ where: { id, tenantId } });
    if (!apto) throw new NotFoundException('Apartamento não encontrado');
    return apto;
  }

  async criar(tenantId: string, dto: CriarApartamentoDto): Promise<Apartamento> {
    try {
      const saved = await this.aptoRepo.save(
        this.aptoRepo.create({
          tenantId,
          bloco: dto.bloco ?? null,
          numero: dto.numero,
          observacoes: dto.observacoes ?? null,
          ativo: true,
        }),
      );
      // recarrega pra trazer o `identificador` (coluna gerada no banco)
      return this.obter(tenantId, saved.id);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Já existe um apartamento com este bloco/número');
      }
      throw err;
    }
  }

  async atualizar(
    tenantId: string,
    id: string,
    dto: AtualizarApartamentoDto,
  ): Promise<Apartamento> {
    const apto = await this.obter(tenantId, id);
    if (dto.bloco !== undefined) apto.bloco = dto.bloco;
    if (dto.numero !== undefined) apto.numero = dto.numero;
    if (dto.observacoes !== undefined) apto.observacoes = dto.observacoes;
    if (dto.ativo !== undefined) apto.ativo = dto.ativo;
    try {
      const saved = await this.aptoRepo.save(apto);
      return this.obter(tenantId, saved.id);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Já existe um apartamento com este bloco/número');
      }
      throw err;
    }
  }

  async desativar(tenantId: string, id: string): Promise<{ ok: true }> {
    const apto = await this.obter(tenantId, id);
    apto.ativo = false;
    await this.aptoRepo.save(apto);
    return { ok: true };
  }

  async listarMoradores(tenantId: string, apartamentoId: string): Promise<Morador[]> {
    await this.obter(tenantId, apartamentoId);
    return this.moradorRepo.find({
      where: { tenantId, apartamentoId, ativo: true },
      order: { principal: 'DESC', nome: 'ASC' },
    });
  }
}
