import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VagaPreco } from '../../database/entities';
import { TipoVaga } from '../../database/entities/vaga.entity';
import { DefinirPrecosDto } from './dto/definir-precos.dto';

/**
 * Tabela de preços por tipo de vaga. Só sugere o valor na hora de criar a
 * locação — o valor cobrado é o que ficou gravado no contrato.
 */
@Injectable()
export class VagasPrecosService {
  constructor(
    @InjectRepository(VagaPreco)
    private readonly repo: Repository<VagaPreco>,
  ) {}

  async listar(tenantId: string): Promise<VagaPreco[]> {
    return this.repo.find({ where: { tenantId }, order: { tipo: 'ASC' } });
  }

  /** Valor sugerido para um tipo, ou null se o síndico não definiu. */
  async valorSugerido(tenantId: string, tipo: TipoVaga): Promise<number | null> {
    const preco = await this.repo.findOne({ where: { tenantId, tipo } });
    return preco?.valorMensal ?? null;
  }

  async definir(tenantId: string, dto: DefinirPrecosDto): Promise<VagaPreco[]> {
    const tipos = dto.precos.map((p) => p.tipo);
    if (new Set(tipos).size !== tipos.length) {
      throw new BadRequestException('Há tipos de vaga repetidos na tabela de preços');
    }

    // upsert: a PK é (tenant_id, tipo), então reenviar a tabela apenas atualiza.
    if (dto.precos.length > 0) {
      await this.repo.upsert(
        dto.precos.map((p) => ({ tenantId, tipo: p.tipo, valorMensal: p.valorMensal })),
        ['tenantId', 'tipo'],
      );
    }

    // Tipo ausente na lista significa "não cobro por este tipo" — remove.
    const remover = await this.repo.find({ where: { tenantId } });
    const paraRemover = remover.filter((p) => !tipos.includes(p.tipo));
    if (paraRemover.length) await this.repo.remove(paraRemover);

    return this.listar(tenantId);
  }
}
