import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AssinaturaCondicao, AssinaturaFatura, AssinaturaFaturaItem } from '../../database/entities';
import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import { AssinaturaCobrancasService } from './assinatura-cobrancas.service';
import {
  AssinaturasService,
  PreviaAssinatura,
  ResponsavelPeloCondominio,
  Sacado,
} from './assinaturas.service';
import { FilaCobrancaService } from './fila-cobranca.service';
import { situacaoDePagamento, type SituacaoPagamento } from './situacao-pagamento';
import { avaliarVencimento, type AvisoVencimento } from './aviso-vencimento';
import { hojeISO, primeiroDia, vencimentoDaCompetencia } from './datas';
import {
  CancelarFaturaDto,
  GerarFaturasDto,
  PagarFaturaDto,
  QueryFaturasDto,
} from './dto/faturas.dto';

/**
 * Dia do vencimento quando nem o condomínio nem a geração pedem outro.
 *
 * Exportado porque a tela do condomínio mostra qual é o padrão que ele está
 * seguindo — "vence dia 10 (padrão da plataforma)" evita o superadmin
 * configurar 10 achando que está mudando alguma coisa.
 */
export const DIA_VENCIMENTO_PADRAO = 10;

/** Código do PostgreSQL para violação de unicidade. */
const UNIQUE_VIOLATION = '23505';

/** Status que ainda esperam pagamento. */
const EM_ABERTO = [StatusFatura.ABERTA, StatusFatura.VENCIDA];

/**
 * O que não entra em "faturado".
 *
 * Cancelada nunca foi cobrada; estornada teve o dinheiro devolvido; em disputa
 * ainda não se sabe de quem é. Somar qualquer uma faria a receita do mês mentir
 * — e é a partir dela que se decide se o mês fechou bem.
 */
const FORA_DOS_TOTAIS = [
  StatusFatura.CANCELADA,
  StatusFatura.ESTORNADA,
  StatusFatura.EM_DISPUTA,
];

export interface FaturaComSacado extends AssinaturaFatura {
  sacado: Sacado;
  /**
   * A cobrança traduzida para quem paga.
   *
   * Vem junto da fatura, e não numa rota à parte, porque a tela precisa do
   * botão "Pagar" na linha da fatura em aberto — buscar o link uma vez por
   * fatura seria uma requisição por linha da lista.
   */
  pagamento: SituacaoPagamento;
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

/**
 * A participação de um condomínio numa fatura que não é dele.
 *
 * Condomínio de carteira não recebe fatura: ele é uma **linha** da fatura da
 * administradora. Sem isso, a tela dele mostraria histórico vazio — como se
 * nunca tivesse sido cobrado.
 */
export interface ParticipacaoEmFatura {
  faturaId: string;
  competencia: string;
  vencimento: string;
  status: StatusFatura;
  apartamentos: number;
  subtotal: number;
  /** O total da fatura inteira, para o item ser lido em proporção. */
  valorFatura: number;
  /** Quem recebeu a cobrança — a administradora, nesse caso. */
  sacadoNome: string;
}

/**
 * Tudo o que a aba "Assinatura" de um condomínio mostra, numa resposta só.
 *
 * Vem junto (e não em cinco rotas) porque a tela abre com tudo isso na mesma
 * pergunta: quanto custa, por quê, quando vence e o que já foi cobrado.
 */
export interface ContaDoCondominio {
  responsavel: ResponsavelPeloCondominio;
  /** A conta do próprio condomínio. `null` quando quem paga é a administradora. */
  conta: PreviaAssinatura | null;
  /** Quanto este condomínio soma **hoje** na conta de quem paga por ele. */
  participacaoAtual: { apartamentos: number; subtotal: number } | null;
  /** Dia negociado com este condomínio. `null` = segue o padrão. */
  diaVencimento: number | null;
  diaVencimentoPadrao: number;
  /** Histórico de preço especial, do mais recente para o mais antigo. */
  condicoes: AssinaturaCondicao[];
  /** Faturas do próprio condomínio (vazio quando ele é de carteira). */
  faturas: FaturaComSacado[];
  /** As faturas da administradora em que ele entrou (vazio quando é direto). */
  participacoes: ParticipacaoEmFatura[];
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
    @InjectRepository(AssinaturaFaturaItem)
    private readonly itemRepo: Repository<AssinaturaFaturaItem>,
    private readonly assinaturas: AssinaturasService,
    private readonly cobrancas: AssinaturaCobrancasService,
    private readonly filaCobranca: FilaCobrancaService,
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
   *
   * O vencimento **não é um só para o lote**: o condomínio que negociou um dia
   * próprio (`tenants.assinatura_dia_vencimento`) usa o dele. O dia pedido na
   * geração — ou o padrão — atende todos os outros. Sem isso, atender um
   * cliente que paga dia 5 exigiria gerar o lote duas vezes, o que a
   * idempotência impede.
   */
  async gerar(dto: GerarFaturasDto): Promise<ResultadoGeracaoFaturas> {
    const competencia = primeiroDia(dto.competencia);
    const diaDoLote = dto.diaVencimento ?? DIA_VENCIMENTO_PADRAO;

    const [previas, existentes, diasNegociados] = await Promise.all([
      this.assinaturas.listarPrevias(),
      this.repo.find({ where: { competencia }, select: { id: true, tenantId: true, administradoraId: true } }),
      this.assinaturas.diasDeVencimentoPorCondominio(),
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

      // Só condomínio direto tem dia próprio: a fatura da carteira é uma só
      // para vários condomínios, e não daria para atender o dia de cada um.
      const dia =
        (sacado.tipo === 'condominio' ? diasNegociados.get(sacado.id) : undefined) ?? diaDoLote;

      const criada = await this.gravar(
        previa,
        competencia,
        vencimentoDaCompetencia(dto.competencia, dia),
      );
      if (criada) criadas++;
      else jaExistiam++;
    }

    const faturas = await this.listar({ competencia: dto.competencia });

    // A emissão vai para a fila **depois** de tudo gravado, e nunca em linha:
    // um gateway lento transformaria o fechamento do mês numa requisição de
    // minutos, e um gateway fora derrubaria o lote inteiro. A fatura nasce
    // sempre; a cobrança vai atrás, com retry.
    await this.filaCobranca.enfileirar(await this.cobrancas.pendentesDeEmissao());

    return { competencia, criadas, jaExistiam, ignorados, faturas };
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

  /**
   * Marca como vencida a fatura em aberto cujo vencimento já passou.
   *
   * O filtro é `status = 'aberta'`, e não "diferente de paga": é o que mantém
   * `estornada` e `em_disputa` fora daqui sozinhos. Uma fatura em disputa
   * virando "vencida" pelo calendário reabriria como dívida algo que está
   * justamente sendo contestado.
   */
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

  /**
   * A assinatura de **um** condomínio, para quem administra a plataforma (e,
   * em leitura, para a administradora dona dele).
   *
   * Difere de `minhaContaDoCondominio` em dois pontos que são o motivo de ela
   * existir: traz o histórico de preço especial e o dia de vencimento (a
   * negociação, que o síndico não vê), e **não devolve conta vazia** para
   * condomínio de carteira — nesse caso mostra a participação dele nas faturas
   * da administradora, que é o histórico de cobrança que ele de fato tem.
   */
  async contaDoCondominio(tenantId: string): Promise<ContaDoCondominio> {
    const responsavel = await this.assinaturas.responsavelPeloCondominio(tenantId);
    const proprio = responsavel.via === 'condominio';

    const [diaVencimento, condicoes, participacoes, previaDoResponsavel] = await Promise.all([
      this.assinaturas.diaVencimentoDoCondominio(tenantId),
      this.assinaturas.listarCondicoes({ tenantId }),
      this.participacoesEmFaturas(tenantId),
      proprio
        ? this.assinaturas.previaDoCondominio(tenantId)
        : this.assinaturas.previaDaAdministradora(responsavel.administradoraId),
    ]);

    // A fatura própria só existe para condomínio direto; a de carteira aparece
    // nas participações, que já foram buscadas acima.
    const faturas = proprio ? await this.listar({ tenantId }) : [];

    // Na prévia da carteira, este condomínio é um item — é ele que responde
    // "quanto este condomínio pesa na conta de quem paga por ele hoje".
    const item = previaDoResponsavel.resultado.itens.find((i) => i.tenantId === tenantId);

    return {
      responsavel,
      conta: proprio ? previaDoResponsavel : null,
      participacaoAtual: item
        ? { apartamentos: item.apartamentos, subtotal: item.subtotal }
        : null,
      diaVencimento,
      diaVencimentoPadrao: DIA_VENCIMENTO_PADRAO,
      condicoes,
      faturas,
      participacoes,
      aviso: avaliarVencimento(faturas),
    };
  }

  /** As faturas (de outro sacado) em que este condomínio entrou como item. */
  private async participacoesEmFaturas(tenantId: string): Promise<ParticipacaoEmFatura[]> {
    // Mesma disciplina do `listar()`: o status é lido depois de acertar o que
    // já venceu, senão a tela mostraria "em aberto" numa fatura de ontem.
    await this.atualizarVencidas();

    const itens = await this.itemRepo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.fatura', 'f')
      .leftJoinAndSelect('f.administradora', 'adm')
      .leftJoinAndSelect('f.tenant', 't')
      .where('i.tenant_id = :tenantId', { tenantId })
      // Só o que foi cobrado de outro: a fatura própria já vai em `faturas`.
      .andWhere('f.administradora_id IS NOT NULL')
      .orderBy('f.competencia', 'DESC')
      .getMany();

    return itens.map((i) => ({
      faturaId: i.faturaId,
      competencia: i.fatura.competencia,
      vencimento: i.fatura.vencimento,
      status: i.fatura.status,
      apartamentos: i.apartamentos,
      subtotal: i.subtotal,
      valorFatura: i.fatura.valor,
      sacadoNome: i.fatura.administradora?.nome ?? 'Administradora removida',
    }));
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

    const emDisputa = por(StatusFatura.EM_DISPUTA);
    const estornadas = por(StatusFatura.ESTORNADA);

    return {
      competencia: competencia ? primeiroDia(competencia) : null,
      totalFaturas: linhas.reduce((acc, l) => acc + Number(l.total), 0),
      // Fora dos totais: cancelada (não foi cobrada e não é dívida), estornada
      // (o dinheiro voltou) e em disputa (ainda não se sabe de quem é). Somar
      // qualquer uma delas em "faturado" faria a receita do mês mentir.
      valorFaturado: linhas
        .filter((l) => !FORA_DOS_TOTAIS.includes(l.status))
        .reduce((acc, l) => acc + Number(l.valor), 0),
      emAberto: abertas.reduce((acc, l) => acc + Number(l.total), 0),
      valorEmAberto: abertas.reduce((acc, l) => acc + Number(l.valor), 0),
      vencidas: Number(por(StatusFatura.VENCIDA)?.total ?? 0),
      valorVencido: Number(por(StatusFatura.VENCIDA)?.valor ?? 0),
      pagas: Number(por(StatusFatura.PAGA)?.total ?? 0),
      valorRecebido: Number(por(StatusFatura.PAGA)?.valor ?? 0),
      // Aparecem separados porque pedem gente, não conta: estorno é dinheiro
      // devolvido e disputa é chargeback correndo.
      estornadas: Number(estornadas?.total ?? 0),
      valorEstornado: Number(estornadas?.valor ?? 0),
      emDisputa: Number(emDisputa?.total ?? 0),
      valorEmDisputa: Number(emDisputa?.valor ?? 0),
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
    if (fatura.status === StatusFatura.ESTORNADA) {
      throw new ConflictException('Fatura estornada não recebe baixa: o dinheiro foi devolvido');
    }
    if (fatura.status === StatusFatura.EM_DISPUTA) {
      // Dar baixa aqui apagaria a disputa da tela e o caso sumiria — que é o
      // oposto do que o status existe para fazer.
      throw new ConflictException(
        'Fatura em disputa não recebe baixa manual: resolva o chargeback primeiro',
      );
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

    // **A baixa local já aconteceu.** O espelho no gateway vem depois e não pode
    // desfazê-la: dinheiro que entrou não fica refém de uma API fora do ar. Se
    // falhar, a fatura fica marcada como dessincronizada e a conciliação
    // resolve. Por isso `espelharBaixa` engole o próprio erro.
    const entidade = await this.repo.findOne({ where: { id } });
    if (entidade) await this.cobrancas.espelharBaixa(entidade);

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

    // Aqui a ordem é a **inversa** da baixa: cancela no gateway primeiro e, se
    // isso falhar, o cancelamento local não acontece. Cancelar só do nosso lado
    // deixaria uma cobrança viva que o cliente pode pagar por engano — e aí ele
    // paga uma fatura que para nós não existe mais.
    const entidade = await this.repo.findOne({ where: { id } });
    if (entidade) await this.cobrancas.cancelarCobranca(entidade);

    await this.repo.update(id, {
      status: StatusFatura.CANCELADA,
      ...(dto.motivo ? { observacao: dto.motivo } : {}),
    });

    return this.obter(id);
  }

  /**
   * A fatura reduzida ao que a tela de pendências precisa.
   *
   * Não devolve a linha inteira de propósito: ali não se opera a fatura, e
   * mandar o objeto completo (com chave de idempotência e status bruto do
   * gateway) espalharia coluna interna por mais uma tela.
   */
  resumirParaPendencia(fatura: AssinaturaFatura) {
    return {
      id: fatura.id,
      competencia: fatura.competencia,
      vencimento: fatura.vencimento,
      valor: fatura.valor,
      status: fatura.status,
      cobrancaStatus: fatura.cobrancaStatus,
      cobrancaErro: fatura.cobrancaErro,
      sacadoNome:
        fatura.tenant?.nome ?? fatura.administradora?.nome ?? fatura.itens?.[0]?.condominioNome ?? '—',
    };
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

    return Object.assign(fatura, { sacado, pagamento: situacaoDePagamento(fatura) });
  }
}
