import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Apartamento, Vaga, VagaCobranca, VagaLocacao } from '../../database/entities';
import { StatusCobranca } from '../../database/entities/vaga-cobranca.entity';
import {
  STATUS_LOCACAO_VIGENTES,
  StatusLocacao,
} from '../../database/entities/vaga-locacao.entity';
import { TipoVaga } from '../../database/entities/vaga.entity';
import { CriarVagaDto } from './dto/criar-vaga.dto';
import { AtualizarVagaDto } from './dto/atualizar-vaga.dto';
import { assertRefDoTenant } from '../../common/tenant-scope/tenant-ref';

/** Situação da vaga, derivada do vínculo e das locações vigentes. */
export type SituacaoVaga = 'livre' | 'vinculada' | 'alugada' | 'inativa';

export interface TotaisCobranca {
  cobrancas: number;
  valorCobrado: number;
  valorRecebido: number;
  valorEmAberto: number;
  valorVencido: number;
}

export interface LocacaoComCobrancas extends VagaLocacao {
  cobrancas: VagaCobranca[];
  totais: TotaisCobranca;
}

export interface HistoricoVaga {
  vaga: Vaga;
  locacoes: LocacaoComCobrancas[];
  resumo: TotaisCobranca & { totalContratos: number; contratosVigentes: number };
}

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
    @InjectRepository(VagaCobranca)
    private readonly cobrancaRepo: Repository<VagaCobranca>,
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

  // ------------------------------------------------- vínculo com apartamento
  //
  // A vaga vinculada é DO APARTAMENTO: o morador vai embora, a vaga fica com a
  // unidade. É o oposto da locação, que é da pessoa. Os métodos abaixo existem
  // para a tela de apartamentos operar esse vínculo sem reescrever as regras —
  // aceitam um EntityManager para participar da transação de quem chama.

  private vagaRepo(manager?: EntityManager): Repository<Vaga> {
    return manager ? manager.getRepository(Vaga) : this.repo;
  }

  private async temLocacaoVigenteEm(
    tenantId: string,
    vagaId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(VagaLocacao) : this.locacaoRepo;
    return repo.exists({
      where: { tenantId, vagaId, status: In([...STATUS_LOCACAO_VIGENTES]) },
    });
  }

  async listarPorApartamento(tenantId: string, apartamentoId: string): Promise<VagaComSituacao[]> {
    const vagas = await this.repo.find({
      where: { tenantId, apartamentoId },
      order: { numero: 'ASC' },
    });
    const vigentes = await this.idsComLocacaoVigente(
      tenantId,
      vagas.map((v) => v.id),
    );
    return vagas.map((v) => this.decorar(v, vigentes));
  }

  /** Cria a vaga já pertencendo ao apartamento. */
  async criarVinculada(
    tenantId: string,
    apartamentoId: string,
    dados: { numero: string; tipo: TipoVaga; localizacao?: string | null },
    manager?: EntityManager,
  ): Promise<Vaga> {
    const repo = this.vagaRepo(manager);
    const numero = dados.numero.trim();
    if (!numero) throw new BadRequestException('Número da vaga é obrigatório');

    const existe = await repo.findOneBy({ tenantId, numero });
    if (existe) throw new ConflictException(`Já existe a vaga "${numero}" neste condomínio`);

    return repo.save(
      repo.create({
        tenantId,
        apartamentoId,
        numero,
        tipo: dados.tipo,
        localizacao: dados.localizacao ?? null,
        ativo: true,
      }),
    );
  }

  /** Passa uma vaga já cadastrada a pertencer ao apartamento. */
  async vincularAoApartamento(
    tenantId: string,
    vagaId: string,
    apartamentoId: string,
    manager?: EntityManager,
  ): Promise<Vaga> {
    const repo = this.vagaRepo(manager);
    const vaga = await repo.findOne({ where: { tenantId, id: vagaId } });
    if (!vaga) throw new NotFoundException('Vaga não encontrada neste condomínio');

    if (vaga.apartamentoId && vaga.apartamentoId !== apartamentoId) {
      throw new ConflictException(
        `Vaga ${vaga.numero} já pertence a outro apartamento. Desvincule lá primeiro.`,
      );
    }
    // Vincular tira a vaga do pool de locação — não pode com contrato em vigor.
    if (await this.temLocacaoVigenteEm(tenantId, vagaId, manager)) {
      throw new ConflictException(
        `Vaga ${vaga.numero} tem locação vigente e não pode virar vaga do apartamento. Encerre a locação primeiro.`,
      );
    }

    vaga.apartamentoId = apartamentoId;
    return repo.save(vaga);
  }

  /** Solta a vaga do apartamento — ela volta para o pool de locação. */
  async desvincularDoApartamento(
    tenantId: string,
    vagaId: string,
    apartamentoId: string,
  ): Promise<VagaComSituacao> {
    const vaga = await this.repo.findOne({ where: { tenantId, id: vagaId, apartamentoId } });
    if (!vaga) throw new NotFoundException('Vaga não encontrada neste apartamento');

    vaga.apartamentoId = null;
    await this.repo.save(vaga);
    return this.obter(tenantId, vagaId);
  }

  /**
   * Desativa as vagas do apartamento — usado quando a unidade sai de operação.
   *
   * A vaga acompanha o apartamento em vez de voltar para o pool: soltar uma vaga
   * para locação é decisão comercial, não efeito colateral de desativar unidade.
   */
  async desativarPorApartamento(
    tenantId: string,
    apartamentoId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = this.vagaRepo(manager);
    const vagas = await repo.find({ where: { tenantId, apartamentoId, ativo: true } });
    if (vagas.length === 0) return 0;

    for (const vaga of vagas) {
      // Dado legado pode ter vaga vinculada E alugada; nesse caso avisamos em
      // vez de desativar por baixo de um contrato em vigor.
      if (await this.temLocacaoVigenteEm(tenantId, vaga.id, manager)) {
        throw new ConflictException(
          `Vaga ${vaga.numero} tem locação vigente. Encerre a locação antes de desativar o apartamento.`,
        );
      }
      vaga.ativo = false;
    }
    await repo.save(vagas);
    return vagas.length;
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
  /**
   * Tudo o que já aconteceu com a vaga: cada contrato, com as cobranças dele e
   * o que foi de fato recebido.
   *
   * Existe porque a informação estava espalhada e efetivamente invisível — as
   * cobranças só apareciam filtradas por competência, então o que aconteceu há
   * três meses sumia da tela. Contrato encerrado continua aqui: dívida não
   * desaparece quando o contrato acaba.
   */
  async historico(tenantId: string, vagaId: string): Promise<HistoricoVaga> {
    const vaga = await this.obter(tenantId, vagaId);

    const locacoes = await this.locacaoRepo.find({
      where: { tenantId, vagaId },
      relations: { morador: true },
      order: { dataInicio: 'DESC', createdAt: 'DESC' },
    });

    const cobrancas = locacoes.length
      ? await this.cobrancaRepo.find({
          where: { tenantId, locacaoId: In(locacoes.map((l) => l.id)) },
          order: { competencia: 'DESC' },
        })
      : [];

    const porLocacao = new Map<string, VagaCobranca[]>();
    for (const cobranca of cobrancas) {
      const lista = porLocacao.get(cobranca.locacaoId) ?? [];
      lista.push(cobranca);
      porLocacao.set(cobranca.locacaoId, lista);
    }

    const contratos = locacoes.map((locacao) => {
      const doContrato = porLocacao.get(locacao.id) ?? [];
      return { ...locacao, cobrancas: doContrato, totais: this.somarCobrancas(doContrato) };
    });

    return {
      vaga,
      locacoes: contratos,
      resumo: {
        totalContratos: locacoes.length,
        contratosVigentes: locacoes.filter((l) => l.status !== StatusLocacao.ENCERRADA).length,
        ...this.somarCobrancas(cobrancas),
      },
    };
  }

  /** Cobrança cancelada não entra em nada: não foi cobrada nem é dívida. */
  private somarCobrancas(cobrancas: VagaCobranca[]): TotaisCobranca {
    const validas = cobrancas.filter((c) => c.status !== StatusCobranca.CANCELADA);
    const emAberto = validas.filter((c) => c.status !== StatusCobranca.PAGA);

    return {
      cobrancas: validas.length,
      valorCobrado: this.somar(validas.map((c) => Number(c.valor))),
      valorRecebido: this.somar(
        validas
          .filter((c) => c.status === StatusCobranca.PAGA)
          .map((c) => Number(c.valorPago ?? c.valor)),
      ),
      valorEmAberto: this.somar(emAberto.map((c) => Number(c.valor))),
      valorVencido: this.somar(
        validas.filter((c) => c.status === StatusCobranca.VENCIDA).map((c) => Number(c.valor)),
      ),
    };
  }

  private somar(valores: number[]): number {
    // Centavos para não acumular erro de ponto flutuante em soma de dinheiro.
    return valores.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
  }

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
