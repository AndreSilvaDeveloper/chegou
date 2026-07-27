import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AssinaturaFatura, AssinaturaFaturaItem } from '../../database/entities';
import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import {
  AssinaturasService,
  PreviaAssinatura,
  ResponsavelPeloCondominio,
  Sacado,
} from './assinaturas.service';
import { avaliarVencimento, type AvisoVencimento } from './aviso-vencimento';
import { hojeISO, primeiroDia, vencimentoDaCompetencia } from './datas';
import {
  CancelarFaturaDto,
  GerarFaturasDto,
  PagarFaturaDto,
  QueryFaturasDto,
} from './dto/faturas.dto';

/** Dia do vencimento quando a geração não pede outro. */
const DIA_VENCIMENTO_PADRAO = 10;

/** Código do PostgreSQL para violação de unicidade. */
const UNIQUE_VIOLATION = '23505';

/** Status que ainda esperam pagamento. */
const EM_ABERTO = [StatusFatura.ABERTA, StatusFatura.VENCIDA];

export interface FaturaComSacado extends AssinaturaFatura {
  sacado: Sacado;
}

/** A assinatura vista pelo próprio cliente. */
export interface MinhaAssinatura {
  /**
   * Quem paga por este condomínio. Só a visão do condomínio traz — é o que
   * permite a tela do síndico dizer "a cobrança é com a sua administradora" em
   * vez de mostrar uma conta vazia.
   */
  responsavel?: ResponsavelPeloCondominio;
  /** A conta de agora. `null` quando quem paga é outro. */
  conta: PreviaAssinatura | null;
  faturas: FaturaComSacado[];
  /**
   * O que está para vencer (ou já venceu). `null` quando não há o que avisar.
   *
   * Vem junto da conta, e não numa rota própria, porque quem abre a tela já
   * carregou as faturas — uma segunda chamada só para descobrir se há aviso
   * repetiria a mesma consulta.
   */
  aviso: AvisoVencimento | null;
}

export interface ResultadoGeracaoFaturas {
  competencia: string;
  criadas: number;
  jaExistiam: number;
  /** Cliente que não gerou fatura, com o motivo — o superadmin precisa saber por quê. */
  ignorados: { sacado: Sacado; motivo: string }[];
  faturas: FaturaComSacado[];
}

/**
 * A fatura mensal da assinatura: gerar, consultar e dar baixa.
 *
 * Quem calcula o valor é o `AssinaturasService` — aqui a fatura é **gravada**,
 * com a fotografia do que foi cobrado (quantidade, modo, preço aplicado). Mudar
 * a tabela de preços amanhã não pode reescrever o que já foi faturado.
 */
@Injectable()
export class AssinaturaFaturasService {
  private readonly logger = new Logger(AssinaturaFaturasService.name);

  constructor(
    @InjectRepository(AssinaturaFatura) private readonly repo: Repository<AssinaturaFatura>,
    private readonly assinaturas: AssinaturasService,
  ) {}

  // ------------------------------------------------------------------ geração

  /**
   * Emite as faturas da competência, uma por cliente.
   *
   * Cliente é o **sacado**: condomínio sem administradora ou administradora com
   * a carteira somada. É `listarPrevias()` que garante que nenhum condomínio
   * apareça duas vezes.
   *
   * Idempotente: os índices únicos `(tenant, competencia)` e
   * `(administradora, competencia)` seguram a corrida entre duas gerações
   * simultâneas; rodar de novo só reporta o que já existia.
   */
  async gerar(dto: GerarFaturasDto): Promise<ResultadoGeracaoFaturas> {
    const competencia = primeiroDia(dto.competencia);
    const vencimento = vencimentoDaCompetencia(
      dto.competencia,
      dto.diaVencimento ?? DIA_VENCIMENTO_PADRAO,
    );

    const [previas, existentes] = await Promise.all([
      this.assinaturas.listarPrevias(),
      this.repo.find({ where: { competencia }, select: { id: true, tenantId: true, administradoraId: true } }),
    ]);

    const jaFaturados = new Set(existentes.map((f) => this.chave(f.tenantId, f.administradoraId)));

    const ignorados: ResultadoGeracaoFaturas['ignorados'] = [];
    let criadas = 0;
    let jaExistiam = 0;

    for (const previa of previas) {
      const { sacado, resultado } = previa;

      if (jaFaturados.has(this.chave(...this.donoDe(sacado)))) {
        jaExistiam++;
        continue;
      }
      // Fatura de R$ 0,00 é ruído: cliente sem unidade ativa ainda não usa o
      // sistema, e cobrança zerada só atrapalha a leitura do mês.
      if (resultado.valor <= 0) {
        ignorados.push({
          sacado,
          motivo:
            resultado.quantidadeApartamentos === 0
              ? 'Nenhum apartamento ativo na competência'
              : 'O valor calculado ficou zerado',
        });
        continue;
      }

      const criada = await this.gravar(previa, competencia, vencimento);
      if (criada) criadas++;
      else jaExistiam++;
    }

    return {
      competencia,
      criadas,
      jaExistiam,
      ignorados,
      faturas: await this.listar({ competencia: dto.competencia }),
    };
  }

  /** Grava a fatura e os itens. `false` quando outra geração chegou antes. */
  private async gravar(
    previa: PreviaAssinatura,
    competencia: string,
    vencimento: string,
  ): Promise<boolean> {
    const { sacado, resultado } = previa;
    const [tenantId, administradoraId] = this.donoDe(sacado);

    const fatura = this.repo.create({
      tenantId,
      administradoraId,
      competencia,
      quantidadeApartamentos: resultado.quantidadeApartamentos,
      modo: resultado.modo,
      precoAplicado: resultado.precoAplicado,
      valorBruto: resultado.valorBruto,
      desconto: resultado.desconto,
      valor: resultado.valor,
      status: StatusFatura.ABERTA,
      vencimento,
      itens: resultado.itens.map(
        (item) =>
          ({
            tenantId: item.tenantId,
            // O nome fica gravado: excluir o condomínio não pode apagar a
            // memória do que foi cobrado.
            condominioNome: item.nome,
            apartamentos: item.apartamentos,
            subtotal: item.subtotal,
          }) as AssinaturaFaturaItem,
      ),
    });

    try {
      await this.repo.save(fatura);
      return true;
    } catch (erro) {
      if (erro instanceof QueryFailedError && (erro as any).code === UNIQUE_VIOLATION) {
        this.logger.warn(`Fatura de ${sacado.nome} em ${competencia} já existia — geração concorrente`);
        return false;
      }
      throw erro;
    }
  }

  // ----------------------------------------------------------------- consulta

  /** Marca como vencida a fatura em aberto cujo vencimento já passou. */
  private async atualizarVencidas(): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AssinaturaFatura)
      .set({ status: StatusFatura.VENCIDA })
      .where('status = :aberta', { aberta: StatusFatura.ABERTA })
      .andWhere('vencimento < :hoje', { hoje: hojeISO() })
      .execute();
  }

  async listar(query: QueryFaturasDto = {}): Promise<FaturaComSacado[]> {
    await this.atualizarVencidas();

    const faturas = await this.repo.find({
      where: {
        ...(query.competencia ? { competencia: primeiroDia(query.competencia) } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.administradoraId ? { administradoraId: query.administradoraId } : {}),
      },
      relations: { tenant: true, administradora: true, itens: true },
      order: { competencia: 'DESC', vencimento: 'ASC' },
    });

    return faturas.map((f) => this.decorar(f));
  }

  async obter(id: string): Promise<FaturaComSacado> {
    const fatura = await this.repo.findOne({
      where: { id },
      relations: { tenant: true, administradora: true, itens: true },
    });
    if (!fatura) throw new NotFoundException('Fatura não encontrada');
    return this.decorar(fatura);
  }

  // ------------------------------------------------------- a conta do cliente

  /**
   * A assinatura do condomínio, para o síndico.
   *
   * Condomínio de carteira não tem conta própria: quem paga é a administradora.
   * Devolver o responsável (em vez de uma lista vazia) é o que faz a tela
   * explicar isso, em vez de parecer que o dado sumiu.
   */
  async minhaContaDoCondominio(tenantId: string): Promise<MinhaAssinatura> {
    const responsavel = await this.assinaturas.responsavelPeloCondominio(tenantId);

    if (responsavel.via === 'administradora') {
      // Sem conta não há vencimento: avisar aqui seria cobrar quem não deve.
      return { responsavel, conta: null, faturas: [], aviso: null };
    }

    const [conta, faturas] = await Promise.all([
      this.assinaturas.previaDoCondominio(tenantId),
      this.listar({ tenantId }),
    ]);
    return { responsavel, conta, faturas, aviso: avaliarVencimento(faturas) };
  }

  /** A assinatura da carteira, para a administradora. */
  async minhaContaDaAdministradora(administradoraId: string): Promise<MinhaAssinatura> {
    const [conta, faturas] = await Promise.all([
      this.assinaturas.previaDaAdministradora(administradoraId),
      this.listar({ administradoraId }),
    ]);
    return { conta, faturas, aviso: avaliarVencimento(faturas) };
  }

  /**
   * Fatura de um condomínio específico.
   *
   * Fatura de outro cliente responde **404, não 403**: quem não é dono dela não
   * pode nem descobrir que ela existe.
   */
  async obterDoTenant(tenantId: string, id: string): Promise<FaturaComSacado> {
    const fatura = await this.obter(id);
    if (fatura.tenantId !== tenantId) throw new NotFoundException('Fatura não encontrada');
    return fatura;
  }

  /** Idem, para a carteira da administradora. */
  async obterDaAdministradora(administradoraId: string, id: string): Promise<FaturaComSacado> {
    const fatura = await this.obter(id);
    if (fatura.administradoraId !== administradoraId) {
      throw new NotFoundException('Fatura não encontrada');
    }
    return fatura;
  }

  /** Faturado, recebido e em aberto — os cards da tela do superadmin. */
  async resumo(competencia?: string) {
    await this.atualizarVencidas();

    const qb = this.repo
      .createQueryBuilder('f')
      .select('f.status', 'status')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect('COALESCE(SUM(f.valor), 0)::float', 'valor')
      .groupBy('f.status');

    if (competencia) {
      qb.where('f.competencia = :competencia', { competencia: primeiroDia(competencia) });
    }

    const linhas = await qb.getRawMany<{ status: StatusFatura; total: number; valor: number }>();
    const por = (s: StatusFatura) => linhas.find((l) => l.status === s);
    const abertas = linhas.filter((l) => EM_ABERTO.includes(l.status));

    return {
      competencia: competencia ? primeiroDia(competencia) : null,
      totalFaturas: linhas.reduce((acc, l) => acc + Number(l.total), 0),
      // Cancelada não entra em nenhum total: não foi cobrada e não é dívida.
      valorFaturado: linhas
        .filter((l) => l.status !== StatusFatura.CANCELADA)
        .reduce((acc, l) => acc + Number(l.valor), 0),
      emAberto: abertas.reduce((acc, l) => acc + Number(l.total), 0),
      valorEmAberto: abertas.reduce((acc, l) => acc + Number(l.valor), 0),
      vencidas: Number(por(StatusFatura.VENCIDA)?.total ?? 0),
      valorVencido: Number(por(StatusFatura.VENCIDA)?.valor ?? 0),
      pagas: Number(por(StatusFatura.PAGA)?.total ?? 0),
      valorRecebido: Number(por(StatusFatura.PAGA)?.valor ?? 0),
    };
  }

  // --------------------------------------------------------------- alterações

  /** Baixa manual — enquanto não há conciliação automática do pagamento. */
  async pagar(id: string, dto: PagarFaturaDto): Promise<FaturaComSacado> {
    const fatura = await this.obter(id);

    if (fatura.status === StatusFatura.PAGA) {
      throw new ConflictException('Esta fatura já está paga');
    }
    if (fatura.status === StatusFatura.CANCELADA) {
      throw new ConflictException('Fatura cancelada não pode receber pagamento');
    }

    const pagaEm = dto.pagaEm ? new Date(dto.pagaEm) : new Date();
    if (Number.isNaN(pagaEm.getTime())) {
      throw new BadRequestException('Data de pagamento inválida');
    }

    await this.repo.update(id, {
      status: StatusFatura.PAGA,
      pagaEm,
      formaPagamento: dto.formaPagamento ?? null,
      ...(dto.observacao !== undefined ? { observacao: dto.observacao || null } : {}),
    });

    return this.obter(id);
  }

  async cancelar(id: string, dto: CancelarFaturaDto): Promise<FaturaComSacado> {
    const fatura = await this.obter(id);

    if (fatura.status === StatusFatura.PAGA) {
      throw new ConflictException('Fatura paga não pode ser cancelada');
    }
    if (fatura.status === StatusFatura.CANCELADA) {
      throw new ConflictException('Esta fatura já está cancelada');
    }

    await this.repo.update(id, {
      status: StatusFatura.CANCELADA,
      ...(dto.motivo ? { observacao: dto.motivo } : {}),
    });

    return this.obter(id);
  }

  // ------------------------------------------------------------------ auxiliar

  /** O par (tenant, administradora) do sacado — exatamente um é preenchido. */
  private donoDe(sacado: Sacado): [string | null, string | null] {
    return sacado.tipo === 'condominio' ? [sacado.id, null] : [null, sacado.id];
  }

  private chave(tenantId: string | null, administradoraId: string | null): string {
    return tenantId ? `t:${tenantId}` : `a:${administradoraId}`;
  }

  /**
   * Anexa quem é o sacado da fatura.
   *
   * A fatura tem dois donos possíveis e só um preenchido; sem isso, toda tela
   * precisaria repetir o `if` para descobrir de quem é a cobrança. O nome cai
   * para o gravado no item quando o condomínio foi excluído (FK `SET NULL`).
   */
  private decorar(fatura: AssinaturaFatura): FaturaComSacado {
    const sacado: Sacado = fatura.administradoraId
      ? {
          tipo: 'administradora',
          id: fatura.administradoraId,
          nome: fatura.administradora?.nome ?? 'Administradora removida',
        }
      : {
          tipo: 'condominio',
          id: fatura.tenantId!,
          nome: fatura.tenant?.nome ?? fatura.itens?.[0]?.condominioNome ?? 'Condomínio removido',
        };

    return Object.assign(fatura, { sacado });
  }
}
