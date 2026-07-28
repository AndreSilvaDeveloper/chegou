import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { Apartamento, Morador } from '../../database/entities';
import { TenantConfigService } from '../../common/tenant-config/tenant-config.service';
import { VagasService } from '../vagas/vagas.service';
import { AtualizarApartamentoDto } from './dto/atualizar-apartamento.dto';
import { CriarApartamentoDto } from './dto/criar-apartamento.dto';
import { VagasDoApartamentoDto } from './dto/vagas-do-apartamento.dto';

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Teto da listagem. Condomínio grande não cabe num select — a tela busca no
 * servidor conforme se digita, e avisa quando a lista veio cortada.
 */
export const LIMITE_LISTAGEM = 50;

/** Como o condomínio organiza as unidades. */
export type EstruturaBlocos = 'unico' | 'multiplos';

@Injectable()
export class ApartamentosService {
  constructor(
    @InjectRepository(Apartamento) private readonly aptoRepo: Repository<Apartamento>,
    @InjectRepository(Morador) private readonly moradorRepo: Repository<Morador>,
    private readonly tenantConfig: TenantConfigService,
    private readonly vagas: VagasService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Estrutura efetiva do condomínio.
   *
   * `estruturaBlocos` é quem manda — um residencial de torre única existe, e
   * deduzir bloco só pelo tipo obrigaria o síndico a inventar um "bloco A" para
   * todo mundo. O `tipo` entra apenas como padrão para condomínio antigo, que
   * pode não ter a estrutura preenchida.
   */
  async estruturaBlocos(tenantId: string): Promise<EstruturaBlocos> {
    const config = await this.tenantConfig.get(tenantId);
    const estrutura = config.estruturaBlocos as EstruturaBlocos | undefined;
    if (estrutura === 'unico' || estrutura === 'multiplos') return estrutura;
    return config.tipo === 'comercial' ? 'unico' : 'multiplos';
  }

  /**
   * O bloco segue a estrutura do condomínio: obrigatório onde há vários blocos,
   * recusado onde só existe um. Devolve o valor a gravar.
   */
  private async normalizarBloco(
    tenantId: string,
    bloco: string | null | undefined,
    blocoAtual?: string | null,
  ): Promise<string | null> {
    const informado = bloco?.trim() || null;
    const estrutura = await this.estruturaBlocos(tenantId);

    // Dado legado: condomínio que virou "bloco único" depois de já ter unidades
    // com bloco. Reenviar o bloco que já está gravado continua valendo — quem
    // está só corrigindo o número não pode ser impedido por isso.
    const mantendoOAtual = blocoAtual !== undefined && informado === (blocoAtual || null);

    if (estrutura === 'unico') {
      if (informado && !mantendoOAtual) {
        throw new BadRequestException(
          'Este condomínio é de bloco único — informe apenas o número da unidade',
        );
      }
      return informado;
    }

    if (!informado) {
      throw new BadRequestException('Informe o bloco da unidade');
    }
    return informado;
  }

  /**
   * Vagas só entram por aqui se o condomínio contratou o módulo e o usuário
   * gerencia vagas. Sem isso, a tela de apartamentos viraria uma porta lateral
   * para criar vaga em condomínio sem o módulo — ou para o porteiro, que não
   * gerencia vagas em lugar nenhum.
   */
  private async assertPodeMexerEmVagas(
    tenantId: string,
    podeGerenciarVagas: boolean,
  ): Promise<void> {
    if (!podeGerenciarVagas) {
      throw new ForbiddenException('Seu perfil não gerencia vagas de garagem');
    }
    if (!(await this.tenantConfig.isModuleEnabled(tenantId, 'vagas'))) {
      throw new ForbiddenException('Módulo "Vagas de garagem" não está habilitado neste condomínio');
    }
  }

  private temVagas(vagas?: VagasDoApartamentoDto): boolean {
    return !!(vagas?.novasVagas?.length || vagas?.vagasExistentesIds?.length);
  }

  /** Cria as vagas novas e vincula as existentes, na mesma transação. */
  private async aplicarVagas(
    tenantId: string,
    apartamentoId: string,
    vagas: VagasDoApartamentoDto,
    manager: EntityManager,
  ): Promise<void> {
    for (const nova of vagas.novasVagas ?? []) {
      await this.vagas.criarVinculada(tenantId, apartamentoId, nova, manager);
    }
    for (const vagaId of vagas.vagasExistentesIds ?? []) {
      await this.vagas.vincularAoApartamento(tenantId, vagaId, apartamentoId, manager);
    }
  }

  async listar(tenantId: string, q?: string): Promise<Apartamento[]> {
    const qb = this.aptoRepo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.ativo = true')
      .orderBy('a.identificador', 'ASC')
      .take(LIMITE_LISTAGEM);
    if (q && q.trim()) {
      // Busca por PREFIXO, e não por "contém": digitar "A" traz o bloco A
      // inteiro, e digitar "1" traz as unidades que começam em 1 (101, 12...),
      // não toda unidade que tenha um 1 no meio. É como o porteiro pensa.
      const prefixo = `${q.trim()}%`;
      qb.andWhere(
        '(a.identificador ILIKE :prefixo OR a.numero ILIKE :prefixo OR a.bloco ILIKE :prefixo)',
        { prefixo },
      );
    }
    return qb.getMany();
  }

  /** Total de unidades ativas do condomínio (a listagem é cortada em {@link LIMITE_LISTAGEM}). */
  async contar(tenantId: string): Promise<number> {
    return this.aptoRepo.count({ where: { tenantId, ativo: true } });
  }

  /** Lista os blocos distintos (não vazios) do condomínio, em ordem alfabética. */
  async listarBlocos(tenantId: string): Promise<string[]> {
    const rows = await this.aptoRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.bloco', 'bloco')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.ativo = true')
      .andWhere("a.bloco IS NOT NULL AND a.bloco <> ''")
      .orderBy('a.bloco', 'ASC')
      .getRawMany<{ bloco: string }>();
    return rows.map((r) => r.bloco);
  }

  /** Busca exata por número (e bloco, se informado). Retorna null se não existir. */
  async buscarPorNumero(
    tenantId: string,
    numero: string,
    bloco?: string,
  ): Promise<Apartamento | null> {
    const qb = this.aptoRepo
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.ativo = true')
      .andWhere('a.numero = :numero', { numero: numero.trim() });
    const b = bloco?.trim();
    if (b) {
      qb.andWhere('a.bloco = :bloco', { bloco: b });
    } else {
      qb.andWhere("(a.bloco IS NULL OR a.bloco = '')");
    }
    return (await qb.getOne()) ?? null;
  }

  async obter(tenantId: string, id: string): Promise<Apartamento> {
    const apto = await this.aptoRepo.findOne({ where: { id, tenantId } });
    if (!apto) throw new NotFoundException('Apartamento não encontrado');
    return apto;
  }

  /**
   * Cria a unidade e, opcionalmente, as vagas que pertencem a ela.
   *
   * Tudo numa transação: vaga com número repetido não pode deixar para trás um
   * apartamento meio criado.
   */
  async criar(
    tenantId: string,
    dto: CriarApartamentoDto,
    opcoes: { podeGerenciarVagas: boolean } = { podeGerenciarVagas: false },
  ): Promise<Apartamento> {
    const bloco = await this.normalizarBloco(tenantId, dto.bloco);
    const comVagas = this.temVagas(dto.vagas);
    if (comVagas) await this.assertPodeMexerEmVagas(tenantId, opcoes.podeGerenciarVagas);

    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Apartamento);
        const saved = await repo.save(
          repo.create({
            tenantId,
            bloco,
            numero: dto.numero,
            observacoes: dto.observacoes ?? null,
            ativo: true,
          }),
        );
        if (comVagas) await this.aplicarVagas(tenantId, saved.id, dto.vagas!, manager);
        return saved.id;
      });
      // recarrega pra trazer o `identificador` (coluna gerada no banco)
      return this.obter(tenantId, id);
    } catch (err) {
      throw this.traduzirDuplicidade(err);
    }
  }

  async atualizar(
    tenantId: string,
    id: string,
    dto: AtualizarApartamentoDto,
  ): Promise<Apartamento> {
    const apto = await this.obter(tenantId, id);
    if (dto.bloco !== undefined) {
      apto.bloco = await this.normalizarBloco(tenantId, dto.bloco, apto.bloco);
    }
    if (dto.numero !== undefined) apto.numero = dto.numero;
    if (dto.observacoes !== undefined) apto.observacoes = dto.observacoes;
    if (dto.ativo !== undefined) apto.ativo = dto.ativo;
    try {
      const saved = await this.aptoRepo.save(apto);
      return this.obter(tenantId, saved.id);
    } catch (err) {
      throw this.traduzirDuplicidade(err);
    }
  }

  /**
   * Desativa a unidade e as vagas dela.
   *
   * A vaga é do apartamento: quando a unidade sai de operação, a vaga sai junto
   * em vez de cair no pool de locação — soltar vaga para aluguel é decisão
   * comercial, não efeito colateral.
   */
  async desativar(tenantId: string, id: string): Promise<{ ok: true; vagasDesativadas: number }> {
    const apto = await this.obter(tenantId, id);

    const vagasDesativadas = await this.dataSource.transaction(async (manager) => {
      const total = await this.vagas.desativarPorApartamento(tenantId, id, manager);
      apto.ativo = false;
      await manager.getRepository(Apartamento).save(apto);
      return total;
    });

    return { ok: true, vagasDesativadas };
  }

  // ------------------------------------------------------- vagas da unidade

  async listarVagas(tenantId: string, apartamentoId: string) {
    await this.obter(tenantId, apartamentoId);
    return this.vagas.listarPorApartamento(tenantId, apartamentoId);
  }

  async adicionarVagas(
    tenantId: string,
    apartamentoId: string,
    dto: VagasDoApartamentoDto,
    opcoes: { podeGerenciarVagas: boolean },
  ) {
    await this.obter(tenantId, apartamentoId);
    await this.assertPodeMexerEmVagas(tenantId, opcoes.podeGerenciarVagas);
    if (!this.temVagas(dto)) {
      throw new BadRequestException('Informe ao menos uma vaga para cadastrar ou vincular');
    }

    await this.dataSource.transaction((manager) =>
      this.aplicarVagas(tenantId, apartamentoId, dto, manager),
    );
    return this.vagas.listarPorApartamento(tenantId, apartamentoId);
  }

  /** Solta a vaga da unidade — ela volta a ficar disponível para locação. */
  async desvincularVaga(
    tenantId: string,
    apartamentoId: string,
    vagaId: string,
    opcoes: { podeGerenciarVagas: boolean },
  ) {
    await this.obter(tenantId, apartamentoId);
    await this.assertPodeMexerEmVagas(tenantId, opcoes.podeGerenciarVagas);
    return this.vagas.desvincularDoApartamento(tenantId, vagaId, apartamentoId);
  }

  /**
   * Traduz violação de unicidade. A transação também grava vagas, então a
   * mensagem não pode assumir que o duplicado é sempre a unidade.
   */
  private traduzirDuplicidade(err: unknown): Error {
    if (err instanceof QueryFailedError && (err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      const detalhe = `${(err as { constraint?: string }).constraint ?? ''} ${err.message}`;
      if (detalhe.includes('vagas')) {
        return new ConflictException('Já existe uma vaga com este número neste condomínio');
      }
      return new ConflictException('Já existe um apartamento com este bloco/número');
    }
    return err instanceof Error ? err : new Error(String(err));
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

    const cobraveis = apartamentos.filter((a) => a.valorCondominio);
    if (cobraveis.length === 0) return { enviados: 0 };

    // Uma consulta para todos os apartamentos, não uma por unidade: com 300
    // unidades eram 300 idas ao banco antes de a primeira mensagem existir.
    const moradores = await this.moradorRepo.find({
      where: {
        tenantId,
        apartamentoId: In(cobraveis.map((a) => a.id)),
        ativo: true,
        principal: true,
        receberWhatsapp: true,
      },
    });

    const valorPorApto = new Map(cobraveis.map((a) => [a.id, a.valorCondominio]));
    const notificacoes = moradores
      .filter((m) => m.telefoneE164)
      .map((morador) => {
        const primeiroNome = morador.nome.split(' ')[0];
        const valor = valorPorApto.get(morador.apartamentoId);
        return {
          tenantId,
          tipo: 'cobranca_condominio' as never,
          destinatarioTelefone: morador.telefoneE164 as string,
          destinatarioNome: morador.nome,
          moradorId: morador.id,
          referenciaTipo: 'cobranca_condominio',
          referenciaId: morador.apartamentoId,
          conteudo: `Olá ${primeiroNome}, o valor do condomínio (R$ ${valor}) vence em breve.`,
          variaveisJson: { nome: primeiroNome, valor },
        };
      });

    if (notificacoes.length === 0) return { enviados: 0 };

    await notificationService.agendarEmLote(notificacoes);
    return { enviados: notificacoes.length };
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
