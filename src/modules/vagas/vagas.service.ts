import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Apartamento, Vaga, VagaLocacao } from '../../database/entities';
import { STATUS_LOCACAO_VIGENTES } from '../../database/entities/vaga-locacao.entity';
import { CriarVagaDto } from './dto/criar-vaga.dto';
import { AtualizarVagaDto } from './dto/atualizar-vaga.dto';
import { assertRefDoTenant } from '../../common/tenant-scope/tenant-ref';

/** Situação da vaga, derivada do vínculo e das locações vigentes. */
export type SituacaoVaga = 'livre' | 'vinculada' | 'alugada' | 'inativa';

export interface VagaComSituacao extends Vaga {
  situacao: SituacaoVaga;
  /** Só pode ser alugada quem está livre: sem apartamento e sem locação vigente. */
  alugavel: boolean;
}

@Injectable()
export class VagasService {
  constructor(
    @InjectRepository(Vaga)
    private readonly repo: Repository<Vaga>,
    @InjectRepository(VagaLocacao)
    private readonly locacaoRepo: Repository<VagaLocacao>,
    @InjectRepository(Apartamento)
    private readonly apartamentoRepo: Repository<Apartamento>,
  ) {}

  /**
   * Confirma que o apartamento é do mesmo condomínio antes de vincular.
   *
   * Sem isso, um síndico poderia vincular uma vaga a um apartamento de outro
   * tenant mandando o UUID direto na request.
   */
  private async assertApartamentoDoTenant(tenantId: string, apartamentoId: string): Promise<void> {
    await assertRefDoTenant(
      this.apartamentoRepo,
      tenantId,
      apartamentoId,
      'Apartamento não encontrado neste condomínio',
    );
  }

  /** Ids das vagas com locação vigente (ativa ou inadimplente). */
  private async idsComLocacaoVigente(tenantId: string, vagaIds?: string[]): Promise<Set<string>> {
    if (vagaIds && vagaIds.length === 0) return new Set();
    const locacoes = await this.locacaoRepo.find({
      where: {
        tenantId,
        status: In([...STATUS_LOCACAO_VIGENTES]),
        ...(vagaIds ? { vagaId: In(vagaIds) } : {}),
      },
      select: { vagaId: true },
    });
    return new Set(locacoes.map((l) => l.vagaId));
  }

  private situacao(vaga: Vaga, temLocacaoVigente: boolean): SituacaoVaga {
    if (!vaga.ativo) return 'inativa';
    if (vaga.apartamentoId) return 'vinculada';
    return temLocacaoVigente ? 'alugada' : 'livre';
  }

  private decorar(vaga: Vaga, vigentes: Set<string>): VagaComSituacao {
    const situacao = this.situacao(vaga, vigentes.has(vaga.id));
    return { ...vaga, situacao, alugavel: situacao === 'livre' };
  }

  /** Entidade crua (sem os campos derivados) — usada antes de salvar. */
  private async obterRaw(tenantId: string, id: string): Promise<Vaga> {
    const vaga = await this.repo.findOne({ where: { tenantId, id } });
    if (!vaga) throw new NotFoundException('Vaga não encontrada');
    return vaga;
  }

  private async temLocacaoVigente(tenantId: string, vagaId: string): Promise<boolean> {
    return this.locacaoRepo.exists({
      where: { tenantId, vagaId, status: In([...STATUS_LOCACAO_VIGENTES]) },
    });
  }

  async listar(tenantId: string): Promise<VagaComSituacao[]> {
    const vagas = await this.repo.find({
      where: { tenantId },
      order: { numero: 'ASC' },
      relations: { apartamento: true },
    });
    const vigentes = await this.idsComLocacaoVigente(tenantId);
    return vagas.map((v) => this.decorar(v, vigentes));
  }

  /** Pool de locação: vagas ativas, sem apartamento e sem locação vigente. */
  async listarDisponiveis(tenantId: string): Promise<VagaComSituacao[]> {
    const vagas = await this.listar(tenantId);
    return vagas.filter((v) => v.alugavel);
  }

  async obter(tenantId: string, id: string): Promise<VagaComSituacao> {
    const vaga = await this.repo.findOne({
      where: { tenantId, id },
      relations: { apartamento: true },
    });
    if (!vaga) throw new NotFoundException('Vaga não encontrada');
    const vigentes = await this.idsComLocacaoVigente(tenantId, [id]);
    return this.decorar(vaga, vigentes);
  }

  async criar(tenantId: string, dto: CriarVagaDto): Promise<VagaComSituacao> {
    const numero = dto.numero.trim();
    if (!numero) throw new BadRequestException('Número da vaga é obrigatório');

    const existe = await this.repo.findOneBy({ tenantId, numero });
    if (existe) throw new ConflictException(`Já existe a vaga "${numero}" neste condomínio`);

    if (dto.apartamentoId) {
      await this.assertApartamentoDoTenant(tenantId, dto.apartamentoId);
    }

    const vaga = this.repo.create({
      ...dto,
      numero,
      apartamentoId: dto.apartamentoId ?? null,
      tenantId,
    });
    const salva = await this.repo.save(vaga);
    return this.obter(tenantId, salva.id);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarVagaDto): Promise<VagaComSituacao> {
    const vaga = await this.obterRaw(tenantId, id);
    const alugada = await this.temLocacaoVigente(tenantId, id);

    if (dto.numero !== undefined) {
      const numero = dto.numero.trim();
      if (!numero) throw new BadRequestException('Número da vaga é obrigatório');
      if (numero !== vaga.numero) {
        const existe = await this.repo.findOneBy({ tenantId, numero });
        if (existe) throw new ConflictException(`Já existe a vaga "${numero}" neste condomínio`);
      }
      vaga.numero = numero;
    }

    // Vincular a um apartamento tira a vaga do pool de locação — não pode
    // acontecer com contrato em vigor.
    if (dto.apartamentoId !== undefined) {
      if (dto.apartamentoId) {
        if (alugada) {
          throw new ConflictException(
            'Vaga com locação vigente não pode ser vinculada a um apartamento. Encerre a locação primeiro.',
          );
        }
        await this.assertApartamentoDoTenant(tenantId, dto.apartamentoId);
        vaga.apartamentoId = dto.apartamentoId;
      } else {
        vaga.apartamentoId = null;
      }
    }

    if (dto.ativo !== undefined) {
      if (!dto.ativo && alugada) {
        throw new ConflictException(
          'Vaga com locação vigente não pode ser desativada. Encerre a locação primeiro.',
        );
      }
      vaga.ativo = dto.ativo;
    }

    if (dto.tipo !== undefined) vaga.tipo = dto.tipo;
    if (dto.localizacao !== undefined) vaga.localizacao = dto.localizacao || null;
    if (dto.observacoes !== undefined) vaga.observacoes = dto.observacoes || null;

    await this.repo.save(vaga);
    return this.obter(tenantId, id);
  }

  /** Soft delete (regra do projeto: nunca apagar registro). */
  async desativar(tenantId: string, id: string): Promise<{ success: true }> {
    const vaga = await this.obterRaw(tenantId, id);
    if (await this.temLocacaoVigente(tenantId, id)) {
      throw new ConflictException(
        'Vaga com locação vigente não pode ser desativada. Encerre a locação primeiro.',
      );
    }
    if (vaga.ativo) {
      vaga.ativo = false;
      await this.repo.save(vaga);
    }
    return { success: true };
  }
}
