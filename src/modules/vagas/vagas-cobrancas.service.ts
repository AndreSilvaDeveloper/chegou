import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Tenant, VagaCobranca, VagaLocacao } from '../../database/entities';
import {
  CobrancaProvider,
  StatusCobranca,
} from '../../database/entities/vaga-cobranca.entity';
import {
  LocatarioTipo,
  STATUS_LOCACAO_VIGENTES,
} from '../../database/entities/vaga-locacao.entity';
import { TipoNotificacao } from '../../database/entities/notificacao.entity';
import { NotificationService } from '../notificacoes/notification.service';
import { COBRANCA_GATEWAY, CobrancaGateway } from './gateway/cobranca.gateway';
import { EMAIL_GATEWAY, EmailGateway } from './gateway/email.gateway';
import {
  formatarCompetencia,
  montarAssuntoEmail,
  montarMensagemCobranca,
} from './cobranca-template';
import {
  AtualizarCobrancaDto,
  CancelarCobrancaDto,
  GerarCobrancasDto,
  QueryCobrancasDto,
  RegistrarPagamentoDto,
} from './dto/cobrancas.dto';

const TZ = 'America/Sao_Paulo';

/** Status que ainda esperam pagamento. */
const EM_ABERTO = [StatusCobranca.PENDENTE, StatusCobranca.ENVIADA, StatusCobranca.VENCIDA];

export interface ResultadoGeracao {
  competencia: string;
  criadas: number;
  jaExistiam: number;
  ignoradas: { locacaoId: string; vaga: string; motivo: string }[];
  cobrancas: VagaCobranca[];
}

export interface ResultadoEnvio {
  whatsapp: 'enviado' | 'sem_telefone' | 'opt_out';
  email: 'enviado' | 'sem_email' | 'indisponivel';
}

@Injectable()
export class VagasCobrancasService {
  private readonly logger = new Logger(VagasCobrancasService.name);

  constructor(
    @InjectRepository(VagaCobranca)
    private readonly repo: Repository<VagaCobranca>,
    @InjectRepository(VagaLocacao)
    private readonly locacaoRepo: Repository<VagaLocacao>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly notifications: NotificationService,
    @Inject(COBRANCA_GATEWAY) private readonly cobrancaGateway: CobrancaGateway,
    @Inject(EMAIL_GATEWAY) private readonly emailGateway: EmailGateway,
  ) {}

  // ------------------------------------------------------------------ datas

  private hojeLocal(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private ultimoDiaDoMes(ano: number, mes: number): number {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  }

  /**
   * Vencimento da competência a partir do dia contratado.
   *
   * Dia 31 em mês de 30 (ou fevereiro) cai no último dia do mês — nunca
   * transborda para o mês seguinte.
   */
  private calcularVencimento(competencia: string, diaContratado: number): string {
    const [ano, mes] = competencia.split('-').map(Number);
    const dia = Math.min(diaContratado, this.ultimoDiaDoMes(ano, mes));
    return `${competencia}-${String(dia).padStart(2, '0')}`;
  }

  private primeiroDia(competencia: string): string {
    return `${competencia}-01`;
  }

  private ultimoDia(competencia: string): string {
    const [ano, mes] = competencia.split('-').map(Number);
    return `${competencia}-${String(this.ultimoDiaDoMes(ano, mes)).padStart(2, '0')}`;
  }

  // -------------------------------------------------------------- geração

  /**
   * Cria as cobranças da competência para as locações vigentes.
   *
   * Idempotente: o índice único (locacao_id, competencia) garante que rodar de
   * novo não duplica. Contrato que ainda não começou ou que já terminou antes
   * do mês é ignorado, com o motivo no retorno.
   */
  async gerar(tenantId: string, dto: GerarCobrancasDto): Promise<ResultadoGeracao> {
    const competencia = dto.competencia;
    const inicioMes = this.primeiroDia(competencia);
    const fimMes = this.ultimoDia(competencia);

    const locacoes = await this.locacaoRepo.find({
      where: {
        tenantId,
        status: In([...STATUS_LOCACAO_VIGENTES]),
        ...(dto.locacaoIds?.length ? { id: In(dto.locacaoIds) } : {}),
      },
      relations: { vaga: true, morador: true },
    });

    if (dto.locacaoIds?.length && locacoes.length !== dto.locacaoIds.length) {
      throw new NotFoundException('Alguma locação informada não existe ou não está vigente');
    }

    const existentes = await this.repo.find({
      where: { tenantId, competencia: inicioMes },
      select: { id: true, locacaoId: true },
    });
    const jaCobradas = new Set(existentes.map((c) => c.locacaoId));

    const ignoradas: ResultadoGeracao['ignoradas'] = [];
    // Objetos simples (não entidades): o insert em lote do QueryBuilder não
    // aceita instância com relações carregadas.
    const novas: QueryDeepPartialEntity<VagaCobranca>[] = [];
    let jaExistiam = 0;

    for (const locacao of locacoes) {
      const vagaNumero = locacao.vaga?.numero ?? '—';

      if (jaCobradas.has(locacao.id)) {
        jaExistiam++;
        continue;
      }
      if (locacao.dataInicio > fimMes) {
        ignoradas.push({
          locacaoId: locacao.id,
          vaga: vagaNumero,
          motivo: `Contrato começa em ${locacao.dataInicio}, depois de ${formatarCompetencia(inicioMes)}`,
        });
        continue;
      }
      if (locacao.dataFim && locacao.dataFim < inicioMes) {
        ignoradas.push({
          locacaoId: locacao.id,
          vaga: vagaNumero,
          motivo: `Contrato encerrado em ${locacao.dataFim}`,
        });
        continue;
      }

      novas.push({
        tenantId,
        locacaoId: locacao.id,
        competencia: inicioMes,
        valor: locacao.valorMensal,
        vencimento: this.calcularVencimento(competencia, locacao.diaVencimento),
        status: StatusCobranca.PENDENTE,
        provider: CobrancaProvider.MANUAL,
      });
    }

    if (novas.length) {
      // orIgnore cobre a corrida entre duas gerações simultâneas.
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(VagaCobranca)
        .values(novas)
        .orIgnore()
        .execute();
    }

    const cobrancas = await this.listar(tenantId, { competencia });
    return {
      competencia: inicioMes,
      criadas: novas.length,
      jaExistiam,
      ignoradas,
      cobrancas,
    };
  }

  // -------------------------------------------------------------- consulta

  /** Marca como vencidas as cobranças em aberto cujo vencimento já passou. */
  private async atualizarVencidas(tenantId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(VagaCobranca)
      .set({ status: StatusCobranca.VENCIDA })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('status IN (:...abertos)', {
        abertos: [StatusCobranca.PENDENTE, StatusCobranca.ENVIADA],
      })
      .andWhere('vencimento < :hoje', { hoje: this.hojeLocal() })
      .execute();
  }

  async listar(tenantId: string, query: QueryCobrancasDto): Promise<VagaCobranca[]> {
    await this.atualizarVencidas(tenantId);

    return this.repo.find({
      where: {
        tenantId,
        ...(query.competencia ? { competencia: this.primeiroDia(query.competencia) } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.locacaoId ? { locacaoId: query.locacaoId } : {}),
      },
      relations: { locacao: { vaga: true, morador: true } },
      order: { competencia: 'DESC', vencimento: 'ASC' },
    });
  }

  async obter(tenantId: string, id: string): Promise<VagaCobranca> {
    const cobranca = await this.repo.findOne({
      where: { tenantId, id },
      relations: { locacao: { vaga: true, morador: true } },
    });
    if (!cobranca) throw new NotFoundException('Cobrança não encontrada');
    return cobranca;
  }

  /** Total em aberto e recebido na competência — alimenta os cards da tela. */
  async resumo(tenantId: string, competencia?: string) {
    await this.atualizarVencidas(tenantId);

    const qb = this.repo
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect('COALESCE(SUM(c.valor), 0)::float', 'valor')
      .where('c.tenant_id = :tenantId', { tenantId })
      .groupBy('c.status');

    if (competencia) {
      qb.andWhere('c.competencia = :competencia', { competencia: this.primeiroDia(competencia) });
    }

    const linhas = await qb.getRawMany<{ status: StatusCobranca; total: number; valor: number }>();
    const por = (s: StatusCobranca) => linhas.find((l) => l.status === s);

    const emAberto = linhas.filter((l) => EM_ABERTO.includes(l.status));
    return {
      competencia: competencia ? this.primeiroDia(competencia) : null,
      totalCobrancas: linhas.reduce((acc, l) => acc + Number(l.total), 0),
      emAberto: emAberto.reduce((acc, l) => acc + Number(l.total), 0),
      valorEmAberto: emAberto.reduce((acc, l) => acc + Number(l.valor), 0),
      vencidas: Number(por(StatusCobranca.VENCIDA)?.total ?? 0),
      valorVencido: Number(por(StatusCobranca.VENCIDA)?.valor ?? 0),
      pagas: Number(por(StatusCobranca.PAGA)?.total ?? 0),
      valorRecebido: Number(por(StatusCobranca.PAGA)?.valor ?? 0),
    };
  }

  // ----------------------------------------------------------------- envio

  /** Dados de contato do responsável, seja morador cadastrado ou externo. */
  private destinatario(locacao: VagaLocacao) {
    if (locacao.locatarioTipo === LocatarioTipo.EXTERNO) {
      return {
        nome: locacao.locatarioNome ?? 'Locatário',
        telefone: locacao.locatarioTelefoneE164,
        email: locacao.locatarioEmail,
        moradorId: null as string | null,
        aceitaWhatsapp: true,
      };
    }
    return {
      nome: locacao.morador?.nome ?? 'Locatário',
      telefone: locacao.morador?.telefoneE164 ?? null,
      email: locacao.morador?.email ?? null,
      moradorId: locacao.moradorId,
      aceitaWhatsapp: locacao.morador?.receberWhatsapp !== false,
    };
  }

  /**
   * Envia a cobrança ao responsável.
   *
   * O WhatsApp passa pela fila de notificações, então herda janela de horário,
   * intervalo, jitter e limite diário das regras anti-bloqueio. O e-mail hoje
   * não sai: não há provedor configurado (ver EmailGateway).
   */
  async enviar(tenantId: string, id: string): Promise<{ cobranca: VagaCobranca; envio: ResultadoEnvio }> {
    const cobranca = await this.obter(tenantId, id);

    if (cobranca.status === StatusCobranca.CANCELADA) {
      throw new ConflictException('Cobrança cancelada não pode ser enviada');
    }
    if (cobranca.status === StatusCobranca.PAGA) {
      throw new ConflictException('Cobrança já está paga');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const contato = this.destinatario(cobranca.locacao);
    const vaga = cobranca.locacao.vaga?.numero ?? '—';

    const mensagem = montarMensagemCobranca({
      nome: contato.nome,
      condominio: tenant?.nome ?? 'seu condomínio',
      vaga,
      competencia: cobranca.competencia,
      valor: cobranca.valor,
      vencimento: cobranca.vencimento,
      boletoUrl: cobranca.boletoUrl,
      pixCopiaCola: cobranca.pixCopiaCola,
    });

    const envio: ResultadoEnvio = { whatsapp: 'sem_telefone', email: 'sem_email' };

    if (contato.telefone && contato.aceitaWhatsapp) {
      const notificacao = await this.notifications.agendarNotificacao({
        tenantId,
        tipo: TipoNotificacao.COBRANCA_VAGA,
        destinatarioTelefone: contato.telefone,
        destinatarioNome: contato.nome,
        moradorId: contato.moradorId,
        referenciaTipo: 'vaga_cobranca',
        referenciaId: cobranca.id,
        conteudo: mensagem,
        variaveisJson: {
          vaga,
          competencia: cobranca.competencia,
          valor: cobranca.valor,
          vencimento: cobranca.vencimento,
        },
      });
      cobranca.notificacaoId = notificacao.id;
      cobranca.enviadaWhatsappAt = new Date();
      envio.whatsapp = 'enviado';
    } else if (contato.telefone && !contato.aceitaWhatsapp) {
      envio.whatsapp = 'opt_out';
    }

    if (contato.email) {
      if (this.emailGateway.disponivel) {
        await this.emailGateway.enviar({
          para: contato.email,
          assunto: montarAssuntoEmail({ vaga, competencia: cobranca.competencia }),
          texto: mensagem,
        });
        cobranca.enviadaEmailAt = new Date();
        envio.email = 'enviado';
      } else {
        // Não marca enviada_email_at: nada saiu de fato.
        envio.email = 'indisponivel';
      }
    }

    if (envio.whatsapp !== 'enviado' && envio.email !== 'enviado') {
      throw new BadRequestException(
        contato.telefone || contato.email
          ? 'Não foi possível enviar: o responsável optou por não receber WhatsApp e o envio por e-mail ainda não está disponível.'
          : 'O responsável não tem telefone nem e-mail cadastrado para receber a cobrança.',
      );
    }

    if (cobranca.status === StatusCobranca.PENDENTE) {
      cobranca.status = StatusCobranca.ENVIADA;
    }
    await this.repo.save(cobranca);

    return { cobranca: await this.obter(tenantId, id), envio };
  }

  // ------------------------------------------------------------- alterações

  async atualizar(tenantId: string, id: string, dto: AtualizarCobrancaDto): Promise<VagaCobranca> {
    const cobranca = await this.obter(tenantId, id);
    if (cobranca.status === StatusCobranca.PAGA) {
      throw new ConflictException('Cobrança paga não pode ser alterada');
    }
    if (cobranca.status === StatusCobranca.CANCELADA) {
      throw new ConflictException('Cobrança cancelada não pode ser alterada');
    }

    if (dto.valor !== undefined) cobranca.valor = dto.valor;
    if (dto.observacoes !== undefined) cobranca.observacoes = dto.observacoes || null;
    if (dto.vencimento !== undefined) {
      cobranca.vencimento = dto.vencimento.slice(0, 10);
      // Vencimento adiado para o futuro tira o status de vencida.
      if (cobranca.status === StatusCobranca.VENCIDA && cobranca.vencimento >= this.hojeLocal()) {
        cobranca.status = cobranca.enviadaWhatsappAt
          ? StatusCobranca.ENVIADA
          : StatusCobranca.PENDENTE;
      }
    }

    await this.repo.save(cobranca);
    return this.obter(tenantId, id);
  }

  /** Baixa manual — enquanto não há conciliação automática pelo provedor. */
  async registrarPagamento(
    tenantId: string,
    id: string,
    dto: RegistrarPagamentoDto,
  ): Promise<VagaCobranca> {
    const cobranca = await this.obter(tenantId, id);
    if (cobranca.status === StatusCobranca.PAGA) {
      throw new ConflictException('Cobrança já está paga');
    }
    if (cobranca.status === StatusCobranca.CANCELADA) {
      throw new ConflictException('Cobrança cancelada não pode receber pagamento');
    }

    cobranca.status = StatusCobranca.PAGA;
    cobranca.pagoAt = dto.pagoEm ? new Date(dto.pagoEm) : new Date();
    cobranca.valorPago = dto.valorPago ?? cobranca.valor;
    if (dto.observacoes) cobranca.observacoes = dto.observacoes;

    await this.repo.save(cobranca);
    return this.obter(tenantId, id);
  }

  async cancelar(tenantId: string, id: string, dto: CancelarCobrancaDto): Promise<VagaCobranca> {
    const cobranca = await this.obter(tenantId, id);
    if (cobranca.status === StatusCobranca.PAGA) {
      throw new ConflictException('Cobrança paga não pode ser cancelada');
    }
    if (cobranca.status === StatusCobranca.CANCELADA) {
      throw new ConflictException('Cobrança já está cancelada');
    }

    // Se um dia houver cobrança externa emitida, cancela lá também.
    if (cobranca.asaasPaymentId) {
      await this.cobrancaGateway.cancelarCobranca(cobranca.asaasPaymentId);
    }

    cobranca.status = StatusCobranca.CANCELADA;
    if (dto.motivo) cobranca.observacoes = dto.motivo;
    await this.repo.save(cobranca);
    return this.obter(tenantId, id);
  }
}
