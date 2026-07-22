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

  async dispararCobranca(tenantId: string, notificationService: any): Promise<{ enviados: number }> {
    const apartamentos = await this.aptoRepo.find({
      where: { tenantId, ativo: true },
    });

    let enviados = 0;

    for (const apto of apartamentos) {
      if (!apto.valorCondominio) continue;

      const moradores = await this.moradorRepo.find({
        where: { tenantId, apartamentoId: apto.id, ativo: true, principal: true },
      });

      for (const morador of moradores) {
        if (!morador.telefoneE164) continue;

        await notificationService.agendarNotificacao({
          tenantId,
          tipo: 'cobranca_condominio',
          destinatarioTelefone: morador.telefoneE164,
          destinatarioNome: morador.nome,
          moradorId: morador.id,
          referenciaTipo: 'cobranca_condominio',
          referenciaId: apto.id,
          conteudo: `Olá ${morador.nome.split(' ')[0]}, o valor do condomínio (R$ ${apto.valorCondominio}) vence em breve.`,
          variaveisJson: {
            nome: morador.nome.split(' ')[0],
            valor: apto.valorCondominio,
          },
        });
        enviados++;
      }
    }

    return { enviados };
  }

  async importarCsv(tenantId: string, fileBuffer: Buffer) {
    const papaparse = require('papaparse');
    const csvData = fileBuffer.toString('utf-8');
    
    const results = papaparse.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const [index, row] of results.data.entries()) {
      try {
        const line = index + 2; // +1 for 0-index, +1 for header
        const bloco = row.bloco?.trim() || null;
        const numero = row.numero?.trim();
        const observacoes = row.observacoes?.trim() || null;
        
        let valorCondominio = null;
        if (row.valor_condominio) {
          valorCondominio = parseFloat(row.valor_condominio.replace(',', '.'));
        }

        if (!numero) {
          errors.push({ line, error: 'Número é obrigatório' });
          errorCount++;
          continue;
        }

        // Verifica se já existe
        const existing = await this.aptoRepo.findOne({
          where: { tenantId, bloco: bloco || '', numero }
        });

        if (existing) {
          errors.push({ line, error: 'Apartamento já existe' });
          errorCount++;
          continue;
        }

        await this.aptoRepo.save(
          this.aptoRepo.create({
            tenantId,
            bloco,
            numero,
            observacoes,
            valorCondominio: (valorCondominio === null || isNaN(valorCondominio)) ? null : valorCondominio,
            ativo: true,
          })
        );
        successCount++;
      } catch (err: any) {
        errors.push({ line: index + 2, error: err.message });
        errorCount++;
      }
    }

    return { successCount, errorCount, errors };
  }
}
