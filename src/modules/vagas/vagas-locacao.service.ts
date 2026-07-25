import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, QueryFailedError, Repository } from 'typeorm';
import { Morador, Vaga, VagaLocacao } from '../../database/entities';
import {
  LocatarioTipo,
  STATUS_LOCACAO_VIGENTES,
  StatusLocacao,
} from '../../database/entities/vaga-locacao.entity';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { AtualizarLocacaoDto } from './dto/atualizar-locacao.dto';
import { StorageService } from '../storage/storage.service';

const PG_UNIQUE_VIOLATION = '23505';
/** Índice parcial que garante uma única locação vigente por vaga. */
const UQ_LOCACAO_VIGENTE = 'uq_vagas_locacao_vaga_vigente';

@Injectable()
export class VagasLocacaoService {
  constructor(
    @InjectRepository(VagaLocacao)
    private readonly repo: Repository<VagaLocacao>,
    @InjectRepository(Vaga)
    private readonly vagaRepo: Repository<Vaga>,
    @InjectRepository(Morador)
    private readonly moradorRepo: Repository<Morador>,
    private readonly storage: StorageService,
  ) {}

  async listar(tenantId: string): Promise<VagaLocacao[]> {
    return this.repo.find({
      where: { tenantId },
      relations: { vaga: { apartamento: true }, morador: true },
      order: { createdAt: 'DESC' },
    });
  }

  async obter(tenantId: string, id: string): Promise<VagaLocacao> {
    const locacao = await this.repo.findOne({
      where: { tenantId, id },
      relations: { vaga: { apartamento: true }, morador: true },
    });
    if (!locacao) throw new NotFoundException('Locação não encontrada');
    return locacao;
  }

  /**
   * A vaga precisa ser deste condomínio, estar ativa e livre.
   *
   * Vaga vinculada a apartamento é de uso próprio da unidade e está fora do
   * pool de locação — essa é a regra central do módulo.
   */
  private async assertVagaAlugavel(tenantId: string, vagaId: string): Promise<Vaga> {
    const vaga = await this.vagaRepo.findOne({ where: { id: vagaId, tenantId } });
    if (!vaga) throw new NotFoundException('Vaga não encontrada neste condomínio');
    if (!vaga.ativo) throw new ConflictException('Vaga inativa não pode ser alugada');
    if (vaga.apartamentoId) {
      throw new ConflictException(
        `Vaga ${vaga.numero} está vinculada a um apartamento e não pode ser alugada. ` +
          'Desvincule a vaga para colocá-la no pool de locação.',
      );
    }

    const vigente = await this.repo.exists({
      where: { tenantId, vagaId, status: In([...STATUS_LOCACAO_VIGENTES]) },
    });
    if (vigente) {
      throw new ConflictException(`Vaga ${vaga.numero} já tem uma locação vigente`);
    }
    return vaga;
  }

  private async assertMoradorDoTenant(tenantId: string, moradorId: string): Promise<Morador> {
    const morador = await this.moradorRepo.findOne({ where: { id: moradorId, tenantId } });
    if (!morador) throw new NotFoundException('Morador não encontrado neste condomínio');
    if (!morador.ativo) throw new ConflictException('Morador inativo não pode ser locatário');
    return morador;
  }

  /**
   * Coerência do locatário. Espelha o CHECK do banco, mas em português e apontando
   * o campo que falta — o erro do Postgres não serve para o usuário final.
   */
  private assertLocatarioCoerente(dados: {
    locatarioTipo: LocatarioTipo;
    moradorId: string | null;
    locatarioNome: string | null;
    locatarioTelefoneE164: string | null;
    locatarioEmail: string | null;
  }): void {
    if (dados.locatarioTipo === LocatarioTipo.MORADOR) {
      if (!dados.moradorId) {
        throw new BadRequestException('Selecione o morador responsável pela vaga');
      }
      return;
    }
    if (!dados.locatarioNome?.trim()) {
      throw new BadRequestException('Informe o nome do locatário');
    }
    if (!dados.locatarioTelefoneE164 && !dados.locatarioEmail) {
      throw new BadRequestException(
        'Informe telefone (WhatsApp) ou e-mail do locatário — é por onde a cobrança é enviada',
      );
    }
  }

  private assertPeriodo(dataInicio: string, dataFim: string | null): void {
    if (dataFim && dataFim < dataInicio) {
      throw new BadRequestException('Data de término não pode ser anterior à data de início');
    }
  }

  async criar(tenantId: string, dto: CriarLocacaoDto): Promise<VagaLocacao> {
    await this.assertVagaAlugavel(tenantId, dto.vagaId);

    const locatarioTipo = dto.locatarioTipo ?? LocatarioTipo.MORADOR;
    const externo = locatarioTipo === LocatarioTipo.EXTERNO;

    // Campos do tipo não escolhido são descartados para não sobrar dado órfão
    // contradizendo o locatarioTipo.
    const dadosLocatario = {
      locatarioTipo,
      moradorId: externo ? null : (dto.moradorId ?? null),
      locatarioNome: externo ? (dto.locatarioNome?.trim() ?? null) : null,
      locatarioDocumento: externo ? (dto.locatarioDocumento?.trim() ?? null) : null,
      locatarioTelefoneE164: externo ? (dto.locatarioTelefoneE164 ?? null) : null,
      locatarioEmail: externo ? (dto.locatarioEmail?.trim().toLowerCase() ?? null) : null,
    };

    this.assertLocatarioCoerente(dadosLocatario);
    this.assertPeriodo(dto.dataInicio, dto.dataFim ?? null);

    if (dadosLocatario.moradorId) {
      const morador = await this.assertMoradorDoTenant(tenantId, dadosLocatario.moradorId);
      // Grava no contrato quem alugou. O `morador_id` é ON DELETE SET NULL:
      // sem este registro, remover o morador deixaria o histórico financeiro
      // sem dono identificável.
      dadosLocatario.locatarioNome = morador.nome;
    }

    const locacao = this.repo.create({
      tenantId,
      vagaId: dto.vagaId,
      ...dadosLocatario,
      valorMensal: dto.valorMensal,
      diaVencimento: dto.diaVencimento,
      dataInicio: dto.dataInicio,
      dataFim: dto.dataFim ?? null,
      status: StatusLocacao.ATIVA,
      observacoes: dto.observacoes ?? null,
    });

    const salva = await this.salvarTratandoConcorrencia(locacao);
    return this.obter(tenantId, salva.id);
  }

  async atualizar(tenantId: string, id: string, dto: AtualizarLocacaoDto): Promise<VagaLocacao> {
    const locacao = await this.repo.findOne({ where: { tenantId, id } });
    if (!locacao) throw new NotFoundException('Locação não encontrada');

    if (dto.locatarioTipo !== undefined) locacao.locatarioTipo = dto.locatarioTipo;
    if (dto.moradorId !== undefined) locacao.moradorId = dto.moradorId || null;
    if (dto.locatarioNome !== undefined) locacao.locatarioNome = dto.locatarioNome?.trim() || null;
    if (dto.locatarioDocumento !== undefined) {
      locacao.locatarioDocumento = dto.locatarioDocumento?.trim() || null;
    }
    if (dto.locatarioTelefoneE164 !== undefined) {
      locacao.locatarioTelefoneE164 = dto.locatarioTelefoneE164 || null;
    }
    if (dto.locatarioEmail !== undefined) {
      locacao.locatarioEmail = dto.locatarioEmail?.trim().toLowerCase() || null;
    }

    // Trocar de morador para externo (ou vice-versa) precisa limpar o lado que
    // deixou de valer, senão o CHECK do banco passa com dado inconsistente.
    if (locacao.locatarioTipo === LocatarioTipo.MORADOR) {
      locacao.locatarioNome = null;
      locacao.locatarioDocumento = null;
      locacao.locatarioTelefoneE164 = null;
      locacao.locatarioEmail = null;
    } else {
      locacao.moradorId = null;
    }

    if (dto.valorMensal !== undefined) locacao.valorMensal = dto.valorMensal;
    if (dto.diaVencimento !== undefined) locacao.diaVencimento = dto.diaVencimento;
    if (dto.dataInicio !== undefined) locacao.dataInicio = dto.dataInicio;
    if (dto.dataFim !== undefined) locacao.dataFim = dto.dataFim || null;
    if (dto.observacoes !== undefined) locacao.observacoes = dto.observacoes || null;

    if (dto.status !== undefined) {
      await this.assertPodeAssumirStatus(tenantId, locacao, dto.status);
      locacao.status = dto.status;
      // Reabrir um contrato encerrado limpa a data de término.
      if (dto.status !== StatusLocacao.ENCERRADA && dto.dataFim === undefined) {
        locacao.dataFim = null;
      }
    }

    this.assertLocatarioCoerente(locacao);
    this.assertPeriodo(locacao.dataInicio, locacao.dataFim);

    if (locacao.moradorId) await this.assertMoradorDoTenant(tenantId, locacao.moradorId);

    await this.salvarTratandoConcorrencia(locacao);
    return this.obter(tenantId, id);
  }

  /** Reativar contrato só vale se a vaga não foi ocupada por outro nesse meio-tempo. */
  private async assertPodeAssumirStatus(
    tenantId: string,
    locacao: VagaLocacao,
    novoStatus: StatusLocacao,
  ): Promise<void> {
    const eraVigente = STATUS_LOCACAO_VIGENTES.includes(
      locacao.status as (typeof STATUS_LOCACAO_VIGENTES)[number],
    );
    const seraVigente = STATUS_LOCACAO_VIGENTES.includes(
      novoStatus as (typeof STATUS_LOCACAO_VIGENTES)[number],
    );
    if (eraVigente || !seraVigente) return;

    const outra = await this.repo.exists({
      where: {
        tenantId,
        vagaId: locacao.vagaId,
        id: Not(locacao.id),
        status: In([...STATUS_LOCACAO_VIGENTES]),
      },
    });
    if (outra) {
      throw new ConflictException('Esta vaga já tem outra locação vigente');
    }
  }

  async encerrar(tenantId: string, id: string): Promise<VagaLocacao> {
    const locacao = await this.repo.findOne({ where: { tenantId, id } });
    if (!locacao) throw new NotFoundException('Locação não encontrada');
    if (locacao.status === StatusLocacao.ENCERRADA) {
      throw new ConflictException('Locação já está encerrada');
    }

    locacao.status = StatusLocacao.ENCERRADA;
    // Contrato encerrado hoje; se começou no futuro, encerra na própria data de
    // início para não violar o CHECK de período.
    const hoje = new Date().toISOString().slice(0, 10);
    locacao.dataFim = hoje < locacao.dataInicio ? locacao.dataInicio : hoje;

    await this.repo.save(locacao);
    return this.obter(tenantId, id);
  }

  // ------------------------------------------------------------- contrato

  /**
   * Anexa (ou substitui) o contrato assinado da locação.
   *
   * O arquivo anterior é removido do storage depois que o novo já está gravado —
   * se a remoção falhar, sobra um órfão, o que é melhor do que perder a
   * referência do contrato válido.
   */
  async anexarContrato(
    tenantId: string,
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<VagaLocacao> {
    const locacao = await this.repo.findOne({ where: { tenantId, id } });
    if (!locacao) throw new NotFoundException('Locação não encontrada');

    const anterior = locacao.contratoKey;
    const { url, key } = await this.storage.uploadContratoVaga(tenantId, file);

    locacao.contratoUrl = url;
    locacao.contratoKey = key;
    locacao.contratoNomeArquivo = file.originalname.slice(0, 255);
    locacao.contratoEnviadoAt = new Date();
    await this.repo.save(locacao);

    if (anterior && anterior !== key) await this.storage.remover(anterior);

    return this.obter(tenantId, id);
  }

  async removerContrato(tenantId: string, id: string): Promise<VagaLocacao> {
    const locacao = await this.repo.findOne({ where: { tenantId, id } });
    if (!locacao) throw new NotFoundException('Locação não encontrada');
    if (!locacao.contratoKey && !locacao.contratoUrl) {
      throw new NotFoundException('Esta locação não tem contrato anexado');
    }

    const key = locacao.contratoKey;
    locacao.contratoUrl = null;
    locacao.contratoKey = null;
    locacao.contratoNomeArquivo = null;
    locacao.contratoEnviadoAt = null;
    await this.repo.save(locacao);

    if (key) await this.storage.remover(key);
    return this.obter(tenantId, id);
  }

  /**
   * Traduz a violação do índice único para 409.
   *
   * A checagem em `assertVagaAlugavel` cobre o caso normal; o índice pega duas
   * requests simultâneas na mesma vaga, quando as duas passam pela checagem
   * antes de qualquer INSERT.
   */
  private async salvarTratandoConcorrencia(locacao: VagaLocacao): Promise<VagaLocacao> {
    try {
      return await this.repo.save(locacao);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === PG_UNIQUE_VIOLATION &&
        String((err as { constraint?: string }).constraint ?? '').includes(UQ_LOCACAO_VIGENTE)
      ) {
        throw new ConflictException('Esta vaga já tem uma locação vigente');
      }
      throw err;
    }
  }
}
