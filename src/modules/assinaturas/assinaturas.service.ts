import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  Administradora,
  Apartamento,
  AssinaturaCondicao,
  AssinaturaFaixa,
  Tenant,
} from '../../database/entities';
import { ModoAssinatura } from '../../database/entities/assinatura-condicao.entity';
import {
  CondicaoEspecial,
  CondominioNaConta,
  FaixaPreco,
  ResultadoAssinatura,
  calcularAssinatura,
} from './calculadora-assinatura';
import { diaAnterior, hojeISO } from './datas';
import { CriarCondicaoDto, EncerrarCondicaoDto, QueryCondicoesDto } from './dto/condicoes.dto';
import { DefinirFaixasDto } from './dto/faixas.dto';

/** Quem recebe a fatura. */
export type Sacado =
  | { tipo: 'condominio'; id: string; nome: string }
  | { tipo: 'administradora'; id: string; nome: string };

export interface PreviaAssinatura {
  sacado: Sacado;
  resultado: ResultadoAssinatura;
  /** Preço especial em vigor, quando existe — para a tela dizer por que difere. */
  condicao: {
    id: string;
    modo: ModoAssinatura;
    descontoPercentual: number | null;
    observacao: string | null;
  } | null;
}

/** Quem paga por um condomínio. */
export type ResponsavelPeloCondominio =
  | { via: 'condominio'; tenantId: string; nome: string }
  | { via: 'administradora'; administradoraId: string; nome: string };

/**
 * Quanto cada cliente paga pelo Chegou.
 *
 * A regra que não pode quebrar: **um condomínio é cobrado uma vez só**. Quem
 * decide é o vínculo — condomínio sem administradora paga o próprio; condomínio
 * de carteira entra na fatura da administradora e não gera fatura própria.
 *
 * Só apartamento **ativo** de condomínio **ativo** conta. Bloco não entra na
 * conta: ele organiza a unidade, não multiplica preço.
 */
@Injectable()
export class AssinaturasService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Administradora) private readonly administradoraRepo: Repository<Administradora>,
    @InjectRepository(Apartamento) private readonly apartamentoRepo: Repository<Apartamento>,
    @InjectRepository(AssinaturaFaixa) private readonly faixaRepo: Repository<AssinaturaFaixa>,
    @InjectRepository(AssinaturaCondicao) private readonly condicaoRepo: Repository<AssinaturaCondicao>,
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------ tabela de preços

  /** Tabela de preços da plataforma, em ordem. */
  async faixas(): Promise<FaixaPreco[]> {
    const faixas = await this.faixaRepo.find({ order: { ordem: 'ASC' } });
    return faixas.map((f) => ({
      ateQuantidade: f.ateQuantidade,
      precoApartamento: f.precoApartamento,
      ordem: f.ordem,
    }));
  }

  /**
   * Substitui a tabela de preços inteira, numa transação.
   *
   * Não mexe em fatura já emitida: o valor cobrado é fotografia gravada na
   * própria fatura. Vale a partir da próxima geração.
   */
  async definirFaixas(dto: DefinirFaixasDto): Promise<FaixaPreco[]> {
    this.validarFaixas(dto.faixas);

    await this.dataSource.transaction(async (manager) => {
      // A tabela é pequena e a ordem é única: trocar por completo é mais
      // simples (e mais fácil de conferir) que casar linha a linha.
      // `delete({})` é recusado pelo TypeORM (critério vazio) — daí o builder.
      await manager.createQueryBuilder().delete().from(AssinaturaFaixa).execute();
      await manager.insert(
        AssinaturaFaixa,
        dto.faixas.map((f, i) => ({
          ateQuantidade: f.ateQuantidade ?? null,
          precoApartamento: f.precoApartamento,
          ordem: i + 1,
        })),
      );
    });

    return this.faixas();
  }

  /**
   * Tabela coerente: tetos crescentes e a última faixa aberta.
   *
   * Sem teto aberto no topo, um cliente maior que a última faixa cairia num
   * preço por acaso — o cálculo tem um resguardo, mas cadastrar assim é erro.
   */
  private validarFaixas(faixas: DefinirFaixasDto['faixas']): void {
    const ultima = faixas[faixas.length - 1];
    if (ultima.ateQuantidade !== null && ultima.ateQuantidade !== undefined) {
      throw new BadRequestException(
        'A última faixa não pode ter teto — é ela que atende os clientes acima da tabela',
      );
    }

    let anterior = 0;
    for (const faixa of faixas.slice(0, -1)) {
      if (faixa.ateQuantidade === null || faixa.ateQuantidade === undefined) {
        throw new BadRequestException('Só a última faixa pode ficar sem teto');
      }
      if (faixa.ateQuantidade <= anterior) {
        throw new BadRequestException(
          `Os tetos das faixas devem crescer: ${faixa.ateQuantidade} vem depois de ${anterior}`,
        );
      }
      anterior = faixa.ateQuantidade;
    }
  }

  /**
   * Prévia de todos os clientes: condomínios diretos + administradoras.
   *
   * É a lista que responde "se eu fechar o mês hoje, quanto entra". Condomínio
   * de carteira não aparece sozinho — ele está dentro da fatura da carteira.
   */
  async listarPrevias(): Promise<PreviaAssinatura[]> {
    const [faixas, diretos, administradoras] = await Promise.all([
      this.faixas(),
      this.tenantRepo.find({
        where: { ativo: true, administradoraId: IsNull() },
        order: { nome: 'ASC' },
      }),
      this.administradoraRepo.find({ where: { ativo: true }, order: { nome: 'ASC' } }),
    ]);

    const previas: PreviaAssinatura[] = [];

    for (const tenant of diretos) {
      previas.push(await this.montarPrevia({ tipo: 'condominio', id: tenant.id, nome: tenant.nome }, faixas));
    }
    for (const adm of administradoras) {
      previas.push(await this.montarPrevia({ tipo: 'administradora', id: adm.id, nome: adm.nome }, faixas));
    }

    return previas;
  }

  /** Prévia de um condomínio direto. */
  async previaDoCondominio(tenantId: string): Promise<PreviaAssinatura> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    return this.montarPrevia({ tipo: 'condominio', id: tenant.id, nome: tenant.nome }, await this.faixas());
  }

  /** Prévia de uma administradora, somando a carteira inteira. */
  async previaDaAdministradora(administradoraId: string): Promise<PreviaAssinatura> {
    const adm = await this.administradoraRepo.findOne({ where: { id: administradoraId } });
    if (!adm) throw new NotFoundException('Administradora não encontrada');
    return this.montarPrevia({ tipo: 'administradora', id: adm.id, nome: adm.nome }, await this.faixas());
  }

  /**
   * Quem paga por este condomínio. É o que permite a tela do síndico dizer
   * "a cobrança é com a sua administradora" em vez de mostrar uma fatura vazia.
   */
  async responsavelPeloCondominio(tenantId: string): Promise<ResponsavelPeloCondominio> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');

    if (!tenant.administradoraId) {
      return { via: 'condominio', tenantId: tenant.id, nome: tenant.nome };
    }

    const adm = await this.administradoraRepo.findOne({ where: { id: tenant.administradoraId } });
    return {
      via: 'administradora',
      administradoraId: tenant.administradoraId,
      nome: adm?.nome ?? 'Administradora',
    };
  }

  // -------------------------------------------------------------- preço especial

  /** Condições de um cliente (ou de todos), da mais recente para a mais antiga. */
  async listarCondicoes(query: QueryCondicoesDto = {}): Promise<AssinaturaCondicao[]> {
    return this.condicaoRepo.find({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.administradoraId ? { administradoraId: query.administradoraId } : {}),
      },
      relations: { tenant: true, administradora: true },
      order: { vigenteDe: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * Cria o preço especial de um cliente, encerrando o anterior.
   *
   * Encerrar é preencher `vigenteAte` na véspera do novo início — nunca apagar.
   * As duas escritas vão na mesma transação porque o índice parcial do banco só
   * aceita **uma** condição em aberto por cliente: gravar a nova antes de fechar
   * a velha estouraria a unicidade.
   */
  async criarCondicao(dto: CriarCondicaoDto): Promise<AssinaturaCondicao> {
    const sacado = await this.resolverSacadoDaCondicao(dto);
    const vigenteDe = dto.vigenteDe ?? hojeISO();

    this.validarCamposDoModo(dto);

    const anterior = await this.condicaoEmAberto(sacado);
    if (anterior && anterior.vigenteDe >= vigenteDe) {
      throw new BadRequestException(
        `Já existe um preço especial em vigor desde ${anterior.vigenteDe}. ` +
          'A nova condição precisa começar depois dessa data.',
      );
    }

    const id = await this.dataSource.transaction(async (manager) => {
      if (anterior) {
        await manager.update(AssinaturaCondicao, anterior.id, {
          vigenteAte: diaAnterior(vigenteDe),
        });
      }

      const criada = manager.create(AssinaturaCondicao, {
        tenantId: sacado.tipo === 'condominio' ? sacado.id : null,
        administradoraId: sacado.tipo === 'administradora' ? sacado.id : null,
        modo: dto.modo,
        precoApartamento: dto.modo === ModoAssinatura.PRECO_APARTAMENTO ? dto.precoApartamento! : null,
        valorFixo: dto.modo === ModoAssinatura.VALOR_FIXO ? dto.valorFixo! : null,
        descontoPercentual: dto.descontoPercentual ?? null,
        vigenteDe,
        vigenteAte: null,
        observacao: dto.observacao ?? null,
        ativo: true,
      });
      const salva = await manager.save(criada);
      return salva.id;
    });

    return this.obterCondicao(id);
  }

  /** Encerra a condição — o cliente volta para a tabela da plataforma. */
  async encerrarCondicao(id: string, dto: EncerrarCondicaoDto): Promise<AssinaturaCondicao> {
    const condicao = await this.obterCondicao(id);
    if (condicao.vigenteAte) {
      throw new BadRequestException(`Esta condição já foi encerrada em ${condicao.vigenteAte}`);
    }

    const vigenteAte = dto.vigenteAte ?? hojeISO();
    if (vigenteAte < condicao.vigenteDe) {
      throw new BadRequestException(
        `O fim da vigência não pode ser antes do início (${condicao.vigenteDe})`,
      );
    }

    await this.condicaoRepo.update(id, { vigenteAte });
    return this.obterCondicao(id);
  }

  async obterCondicao(id: string): Promise<AssinaturaCondicao> {
    const condicao = await this.condicaoRepo.findOne({
      where: { id },
      relations: { tenant: true, administradora: true },
    });
    if (!condicao) throw new NotFoundException('Condição não encontrada');
    return condicao;
  }

  /** O cliente da condição existe e é exatamente um (condomínio XOR administradora). */
  private async resolverSacadoDaCondicao(dto: CriarCondicaoDto): Promise<Sacado> {
    if (Boolean(dto.tenantId) === Boolean(dto.administradoraId)) {
      throw new BadRequestException(
        'Informe o condomínio ou a administradora do preço especial — um dos dois, não os dois',
      );
    }

    if (dto.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
      if (!tenant) throw new NotFoundException('Condomínio não encontrado');
      // Quem paga é a administradora: condição no condomínio de carteira nunca
      // seria aplicada, e daria a impressão de desconto concedido.
      if (tenant.administradoraId) {
        throw new BadRequestException(
          'Este condomínio é cobrado pela administradora dele — o preço especial precisa ser cadastrado na administradora',
        );
      }
      return { tipo: 'condominio', id: tenant.id, nome: tenant.nome };
    }

    const adm = await this.administradoraRepo.findOne({ where: { id: dto.administradoraId } });
    if (!adm) throw new NotFoundException('Administradora não encontrada');
    return { tipo: 'administradora', id: adm.id, nome: adm.nome };
  }

  /** O modo exige o campo que ele usa — condição pela metade viraria fatura zerada. */
  private validarCamposDoModo(dto: CriarCondicaoDto): void {
    if (dto.modo === ModoAssinatura.PRECO_APARTAMENTO && dto.precoApartamento === undefined) {
      throw new BadRequestException('Informe o preço por apartamento negociado');
    }
    if (dto.modo === ModoAssinatura.VALOR_FIXO && dto.valorFixo === undefined) {
      throw new BadRequestException('Informe o valor fixo mensal');
    }
  }

  /** A condição sem data de fim deste cliente, se houver. */
  private async condicaoEmAberto(sacado: Sacado): Promise<AssinaturaCondicao | null> {
    return this.condicaoRepo.findOne({
      where: {
        ativo: true,
        vigenteAte: IsNull(),
        ...(sacado.tipo === 'condominio'
          ? { tenantId: sacado.id }
          : { administradoraId: sacado.id }),
      },
    });
  }

  private async montarPrevia(sacado: Sacado, faixas: FaixaPreco[]): Promise<PreviaAssinatura> {
    const condominios = await this.condominiosDoSacado(sacado);
    const condicao = await this.condicaoVigente(sacado);

    return {
      sacado,
      resultado: calcularAssinatura({
        condominios,
        faixas,
        condicao: condicao ? this.paraCondicaoEspecial(condicao) : null,
      }),
      condicao: condicao
        ? {
            id: condicao.id,
            modo: condicao.modo,
            descontoPercentual: condicao.descontoPercentual,
            observacao: condicao.observacao,
          }
        : null,
    };
  }

  /** Os condomínios que compõem a conta do sacado, já com a contagem de unidades. */
  private async condominiosDoSacado(sacado: Sacado): Promise<CondominioNaConta[]> {
    const tenants =
      sacado.tipo === 'condominio'
        ? await this.tenantRepo.find({ where: { id: sacado.id, ativo: true } })
        : await this.tenantRepo.find({
            where: { administradoraId: sacado.id, ativo: true },
            order: { nome: 'ASC' },
          });

    if (tenants.length === 0) return [];

    const contagem = await this.contarApartamentos(tenants.map((t) => t.id));
    return tenants.map((t) => ({
      tenantId: t.id,
      nome: t.nome,
      apartamentos: contagem.get(t.id) ?? 0,
    }));
  }

  /** Apartamentos ativos por condomínio, numa consulta só. */
  private async contarApartamentos(tenantIds: string[]): Promise<Map<string, number>> {
    const linhas = await this.apartamentoRepo
      .createQueryBuilder('a')
      .select('a.tenant_id', 'tenantId')
      .addSelect('COUNT(*)', 'total')
      .where('a.tenant_id IN (:...tenantIds)', { tenantIds })
      .andWhere('a.ativo = true')
      .groupBy('a.tenant_id')
      .getRawMany<{ tenantId: string; total: string }>();

    return new Map(linhas.map((l) => [l.tenantId, Number(l.total)]));
  }

  /** Preço especial em vigor hoje, se houver. */
  private async condicaoVigente(sacado: Sacado): Promise<AssinaturaCondicao | null> {
    const hoje = hojeISO();
    const qb = this.condicaoRepo
      .createQueryBuilder('c')
      .where('c.ativo = true')
      .andWhere('c.vigente_de <= :hoje', { hoje })
      .andWhere('(c.vigente_ate IS NULL OR c.vigente_ate >= :hoje)', { hoje })
      .orderBy('c.vigente_de', 'DESC');

    if (sacado.tipo === 'condominio') {
      qb.andWhere('c.tenant_id = :id', { id: sacado.id });
    } else {
      qb.andWhere('c.administradora_id = :id', { id: sacado.id });
    }

    return qb.getOne();
  }

  private paraCondicaoEspecial(condicao: AssinaturaCondicao): CondicaoEspecial {
    return {
      modo: condicao.modo,
      precoApartamento: condicao.precoApartamento,
      valorFixo: condicao.valorFixo,
      descontoPercentual: condicao.descontoPercentual,
    };
  }
}
