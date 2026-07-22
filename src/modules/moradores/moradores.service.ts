import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { AtualizarMoradorDto } from './dto/atualizar-morador.dto';
import { CriarMoradorDto } from './dto/criar-morador.dto';
import { ListarMoradoresQuery } from './dto/listar-moradores.query';

@Injectable()
export class MoradoresService {
  constructor(
    @InjectRepository(Morador) private readonly repo: Repository<Morador>,
    @InjectRepository(Apartamento) private readonly aptoRepo: Repository<Apartamento>,
  ) {}

  async listar(tenantId: string, q: ListarMoradoresQuery): Promise<Morador[]> {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.apartamento', 'a')
      .where('m.tenantId = :tenantId', { tenantId })
      .andWhere('m.ativo = true');
    if (q.apartamentoId) qb.andWhere('m.apartamentoId = :aptoId', { aptoId: q.apartamentoId });
    if (q.q && q.q.trim()) {
      qb.andWhere('(m.nome ILIKE :s OR m.telefoneE164 ILIKE :s OR m.documento ILIKE :s)', {
        s: `%${q.q.trim()}%`,
      });
    }
    qb.orderBy('a.identificador', 'ASC').addOrderBy('m.principal', 'DESC').addOrderBy('m.nome', 'ASC');
    return qb.getMany();
  }

  async obter(tenantId: string, id: string): Promise<Morador> {
    const morador = await this.repo.findOne({
      where: { id, tenantId },
      relations: { apartamento: true },
    });
    if (!morador) throw new NotFoundException('Morador não encontrado');
    return morador;
  }

  async criar(tenantId: string, dto: CriarMoradorDto): Promise<Morador> {
    const apto = await this.aptoRepo.findOne({
      where: { id: dto.apartamentoId, tenantId, ativo: true },
    });
    if (!apto) throw new BadRequestException('Apartamento não encontrado neste condomínio');

    if (dto.principal) {
      await this.repo.update(
        { tenantId, apartamentoId: apto.id, principal: true, ativo: true },
        { principal: false },
      );
    }

    return this.repo.save(
      this.repo.create({
        tenantId,
        apartamentoId: apto.id,
        nome: dto.nome,
        telefoneE164: dto.telefoneE164 ?? null,
        documento: dto.documento ?? null,
        email: dto.email ?? null,
        principal: dto.principal ?? false,
        receberWhatsapp: dto.receberWhatsapp ?? true,
        ativo: true,
      }),
    );
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarMoradorDto): Promise<Morador> {
    const morador = await this.obter(tenantId, id);

    if (dto.apartamentoId && dto.apartamentoId !== morador.apartamentoId) {
      const apto = await this.aptoRepo.findOne({
        where: { id: dto.apartamentoId, tenantId, ativo: true },
      });
      if (!apto) throw new BadRequestException('Apartamento de destino não encontrado');
      morador.apartamentoId = apto.id;
    }

    if (dto.nome !== undefined) morador.nome = dto.nome;
    if (dto.telefoneE164 !== undefined) morador.telefoneE164 = dto.telefoneE164;
    if (dto.documento !== undefined) morador.documento = dto.documento;
    if (dto.email !== undefined) morador.email = dto.email;
    if (dto.receberWhatsapp !== undefined) morador.receberWhatsapp = dto.receberWhatsapp;
    if (dto.ativo !== undefined) morador.ativo = dto.ativo;

    if (dto.principal === true && !morador.principal) {
      await this.repo.update(
        { tenantId, apartamentoId: morador.apartamentoId, principal: true, ativo: true },
        { principal: false },
      );
      morador.principal = true;
    } else if (dto.principal === false) {
      morador.principal = false;
    }

    return this.repo.save(morador);
  }

  async desativar(tenantId: string, id: string): Promise<{ ok: true }> {
    const morador = await this.obter(tenantId, id);
    morador.ativo = false;
    morador.principal = false;
    await this.repo.save(morador);
    return { ok: true };
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
        const line = index + 2;
        const apartamentoIdentificador = row.apartamento_identificador?.trim();
        const nome = row.nome?.trim();
        const telefone = row.telefone?.trim() || null;
        const documento = row.documento?.trim() || null;
        const email = row.email?.trim() || null;
        const principal = row.principal === 'true' || row.principal === '1';
        const receberWhatsapp = row.receber_whatsapp !== 'false' && row.receber_whatsapp !== '0';

        if (!apartamentoIdentificador || !nome) {
          errors.push({ line, error: 'apartamento_identificador e nome são obrigatórios' });
          errorCount++;
          continue;
        }

        // Buscar apartamento pelo identificador (Ex: "A-101" ou "101")
        const [bloco, numero] = apartamentoIdentificador.includes('-') 
          ? apartamentoIdentificador.split('-') 
          : [null, apartamentoIdentificador];

        const qb = this.aptoRepo.createQueryBuilder('a')
          .where('a.tenantId = :tenantId', { tenantId })
          .andWhere('a.ativo = true');
        
        if (bloco) {
          qb.andWhere('a.bloco = :bloco', { bloco });
        } else {
          qb.andWhere('a.bloco IS NULL');
        }
        qb.andWhere('a.numero = :numero', { numero });

        const apto = await qb.getOne();

        if (!apto) {
          errors.push({ line, error: `Apartamento ${apartamentoIdentificador} não encontrado` });
          errorCount++;
          continue;
        }

        // Verifica se o morador já existe (nome + apartamento)
        const existing = await this.repo.findOne({
          where: { tenantId, apartamentoId: apto.id, nome }
        });

        if (existing) {
          errors.push({ line, error: 'Morador já existe neste apartamento' });
          errorCount++;
          continue;
        }

        // Se for o principal, desmarca os outros
        if (principal) {
          await this.repo.update(
            { tenantId, apartamentoId: apto.id, principal: true, ativo: true },
            { principal: false },
          );
        }

        await this.repo.save(
          this.repo.create({
            tenantId,
            apartamentoId: apto.id,
            nome,
            telefoneE164: telefone,
            documento,
            email,
            principal,
            receberWhatsapp,
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
