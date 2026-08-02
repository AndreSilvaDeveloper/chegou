import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AssinaturaFatura } from '../../database/entities';
import {
  StatusCobranca,
  StatusFatura,
} from '../../database/entities/assinatura-fatura.entity';
import { AuditService } from '../../common/audit/audit.service';
import { AcessoService } from '../pagamentos/acesso.service';
import { CobrancasService } from '../pagamentos/cobrancas.service';
import { PaymentApiError } from '../pagamentos/payment-api.client';
import { deveAvancar, statusDaFatura } from '../pagamentos/status-cobranca';
import { AssinaturaClientesService } from './assinatura-clientes.service';
import { CupomFaturaService } from './cupom-fatura.service';

/** `2026-04-01` → `04/2026`, como o cliente lê no extrato do cartão ou no boleto. */
function competenciaLegivel(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

/**
 * As únicas colunas que a emissão escreve.
 *
 * Escrito à mão em vez de `Partial<AssinaturaFatura>` para o compilador recusar
 * uma gravação em `valor` ou `status` vinda daqui — a fatura é fotografia do que
 * foi cobrado, e quem emite não pode reescrevê-la.
 */
type CamposDeCobranca = Partial<
  Pick<
    AssinaturaFatura,
    | 'cobrancaId'
    | 'cobrancaAsaasId'
    | 'cobrancaStatus'
    | 'cobrancaStatusGateway'
    | 'cobrancaIdempotencyKey'
    | 'cobrancaErro'
    | 'cobrancaDessincronizada'
    | 'cupomCodigo'
    | 'cupomDesconto'
    | 'valor'
    | 'invoiceUrl'
    | 'sincronizadoEm'
  >
>;

export interface ResultadoEmissao {
  ok: boolean;
  faturaId: string;
  cobrancaId: string | null;
  invoiceUrl: string | null;
  status: StatusCobranca;
  detalhe?: string;
}

/**
 * A fatura virando cobrança.
 *
 * A divisão com o módulo [Pagamentos](../pagamentos/CLAUDE.md): lá se sabe
 * falar com a API, aqui se sabe o que é uma fatura. Este serviço é o único que
 * grava as colunas `cobranca_*`.
 *
 * **Gerar a fatura e emitir a cobrança são passos separados**, e isso não é
 * organização de código: a geração mensal é local e não pode depender de rede.
 * Se o gateway estiver fora no dia 1º, as faturas nascem do mesmo jeito e a
 * emissão espera. Misturar os dois é como se perde um mês de faturamento por um
 * timeout.
 */
@Injectable()
export class AssinaturaCobrancasService {
  private readonly logger = new Logger(AssinaturaCobrancasService.name);

  constructor(
    @InjectRepository(AssinaturaFatura) private readonly repo: Repository<AssinaturaFatura>,
    private readonly cobrancas: CobrancasService,
    private readonly clientes: AssinaturaClientesService,
    private readonly acesso: AcessoService,
    private readonly cupom: CupomFaturaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Emite a cobrança de uma fatura.
   *
   * Idempotente em três camadas, e as três são necessárias:
   *
   * 1. **Só emite fatura em `pendente`/`erro`/`desligada`.** Uma já `emitida`
   *    volta o que tem, sem tocar no gateway.
   * 2. **A `Idempotency-Key` é persistida ANTES do POST.** Gerar e mandar sem
   *    gravar perderia a chave num crash entre as duas coisas, e o retry criaria
   *    outra — que é exatamente como se cobra o cliente duas vezes.
   * 3. **409 é sucesso** (tratado no `CobrancasService`): é a resposta de um
   *    retry que deu certo.
   */
  async emitir(faturaId: string): Promise<ResultadoEmissao> {
    const fatura = await this.repo.findOne({ where: { id: faturaId } });
    if (!fatura) throw new NotFoundException('Fatura não encontrada');

    if (fatura.cobrancaStatus === StatusCobranca.EMITIDA && fatura.cobrancaId) {
      return this.resultado(fatura, true);
    }
    if (!this.cobrancas.ligado) {
      await this.marcar(fatura, { cobrancaStatus: StatusCobranca.DESLIGADA });
      return this.resultado(fatura, false, 'Cobrança desligada neste ambiente');
    }

    const impedimento = this.impedimentoDeEmissao(fatura);
    if (impedimento) {
      await this.marcarErro(fatura, impedimento);
      return this.resultado(fatura, false, impedimento);
    }

    const sacado = fatura.tenantId
      ? ({ tipo: 'condominio', id: fatura.tenantId } as const)
      : ({ tipo: 'administradora', id: fatura.administradoraId! } as const);

    const vinculo = await this.clientes.vinculoDe(sacado.tipo, sacado.id);
    if (!vinculo?.customerId) {
      const motivo =
        'Cliente ainda não existe no gateway. Sincronize-o na aba Pendências antes de emitir.';
      await this.marcarErro(fatura, motivo);
      return this.resultado(fatura, false, motivo);
    }

    // A chave nasce aqui e fica gravada. Se já existe (tentativa anterior que
    // falhou ou expirou no meio), é a MESMA que vai de novo — é ela que faz a
    // API devolver a cobrança que talvez já tenha sido criada.
    const idempotencyKey = fatura.cobrancaIdempotencyKey ?? randomUUID();
    if (!fatura.cobrancaIdempotencyKey) {
      await this.marcar(fatura, { cobrancaIdempotencyKey: idempotencyKey });
    }

    // O cupom entra AQUI, e não na geração: validar é chamada de rede, e a
    // geração mensal não pode depender dela. Permitido porque a fatura ainda
    // está em `pendente` — nunca foi cobrada.
    const cupom = await this.cupomDaFatura(fatura, sacado, vinculo.customerId);
    if (cupom) {
      // **Líquido zero não vira cobrança**: o gateway não emite R$ 0,00. A
      // fatura nasce paga, com o motivo — o histórico mostra o mês coberto em
      // vez de um buraco.
      if (cupom.valorLiquido <= 0) {
        return this.cortesiaTotal(fatura, cupom.codigo, cupom.desconto);
      }
      await this.marcar(fatura, {
        cupomCodigo: cupom.codigo,
        cupomDesconto: cupom.desconto,
        valor: cupom.valorLiquido,
      });
    }

    try {
      const emitida = await this.cobrancas.emitir({
        customerId: vinculo.customerId,
        // **O valor vai SEM o cupom, junto do código.** Mandar o valor já
        // descontado *e* o código aplicaria o desconto duas vezes — o bug de
        // dinheiro mais fácil de escrever nesta integração.
        valor: cupom ? cupom.valorSemCupom : fatura.valor,
        cupomCodigo: cupom?.codigo,
        vencimento: fatura.vencimento,
        descricao: await this.descricao(fatura),
        referenciaExterna: fatura.id,
        idempotencyKey,
      });

      // O valor que o gateway registrou tem de ser o da fatura — **já com o
      // cupom**. Divergência aqui significa que o desconto de lá não bateu com o
      // que gravamos, e emitir assim deixaria a tela dizendo um número e a
      // cobrança outro. Por isso a fatura vira pendência em vez de ser emitida.
      if (Math.abs(emitida.valor - fatura.valor) >= 0.01) {
        return this.divergenciaDeValor(fatura, emitida.valor);
      }

      await this.marcar(fatura, {
        cobrancaId: emitida.cobrancaId,
        cobrancaAsaasId: emitida.asaasId,
        invoiceUrl: emitida.invoiceUrl,
        cobrancaStatus: StatusCobranca.EMITIDA,
        cobrancaStatusGateway: emitida.statusGateway,
        cobrancaErro: null,
        sincronizadoEm: new Date(),
      });

      return this.resultado(fatura, true);
    } catch (err) {
      // **Cupom que expirou entre validar e cobrar.** A própria API revalida na
      // hora de aplicar, para não estourar `maxUses` numa corrida — então o
      // `validate` pode ter dito "vale" e o `POST` responder 422. Recalcula sem
      // o cupom e emite: a fatura ainda está em `pendente`, nunca foi cobrada.
      if (cupom && err instanceof PaymentApiError && err.status === 422) {
        return this.reemitirSemCupom(fatura, cupom.valorSemCupom, err.message);
      }

      const detalhe = err instanceof PaymentApiError ? err.message : (err as Error).message;
      await this.marcarErro(fatura, detalhe);
      this.logger.error(`Emissão da fatura ${fatura.id} falhou: ${detalhe}`);
      return this.resultado(fatura, false, detalhe);
    }
  }

  /**
   * O gateway registrou um valor diferente do nosso.
   *
   * A cobrança **existe** do outro lado, com um valor que não combinamos — e um
   * link que o cliente pode abrir e pagar. Cancelá-la é o passo que impede o
   * cliente de pagar um valor errado; deixar viva enquanto marcamos erro seria
   * o pior dos dois mundos.
   *
   * O cancelamento é best-effort: falhando, a fatura fica com o motivo e a
   * conciliação encontra a cobrança órfã na próxima rodada.
   */
  private async divergenciaDeValor(
    fatura: AssinaturaFatura,
    valorDoGateway: number,
  ): Promise<ResultadoEmissao> {
    const detalhe =
      `A fatura diz ${fatura.valor} e o gateway registrou ${valorDoGateway}. ` +
      `A cobrança foi cancelada para o cliente não pagar um valor divergente.`;

    this.logger.error(`Fatura ${fatura.id}: ${detalhe}`);

    // Achar a cobrança pela referência externa: o `emitir` devolveu o id, mas
    // não chegamos a gravá-lo — de propósito, para não deixar a fatura
    // apontando para uma cobrança que estamos prestes a cancelar.
    try {
      const existente = await this.cobrancas.consultarPorReferencia(fatura.id);
      if (existente) await this.cobrancas.cancelar(existente.cobrancaId);
    } catch (err) {
      this.logger.warn(
        `Não deu para cancelar a cobrança divergente da fatura ${fatura.id}: ${(err as Error).message}`,
      );
    }

    await this.marcarErro(fatura, detalhe);
    return this.resultado(fatura, false, detalhe);
  }

  /**
   * Emite de novo, sem o cupom, devolvendo a fatura ao valor cheio.
   *
   * Registrado no `audit_log`: o cliente esperava um desconto e não teve, e
   * daqui a três meses alguém vai perguntar por quê.
   */
  private async reemitirSemCupom(
    fatura: AssinaturaFatura,
    valorCheio: number,
    motivo: string,
  ): Promise<ResultadoEmissao> {
    this.logger.warn(`Cupom da fatura ${fatura.id} recusado na cobrança (${motivo}); emitindo sem ele`);

    await this.marcar(fatura, { cupomCodigo: null, cupomDesconto: null, valor: valorCheio });
    await this.audit.log({
      action: 'assinatura.cupom.recusado_na_emissao',
      entity: 'assinatura_faturas',
      entityId: fatura.id,
      diffJson: { motivo, valorSemCupom: valorCheio },
    });

    // Chave nova: a anterior está associada, do lado deles, à tentativa que
    // levava o cupom. Reusá-la devolveria aquela mesma tentativa recusada.
    await this.marcar(fatura, { cobrancaIdempotencyKey: randomUUID() });
    return this.emitir(fatura.id);
  }

  /**
   * Cupom que zera a fatura: **não vira cobrança**.
   *
   * O gateway não emite R$ 0,00. A fatura é gravada zerada e já nasce paga, com
   * o motivo — assim o histórico do cliente mostra o mês coberto em vez de um
   * buraco que ninguém sabe explicar.
   */
  private async cortesiaTotal(
    fatura: AssinaturaFatura,
    codigo: string,
    desconto: number,
  ): Promise<ResultadoEmissao> {
    await this.marcar(fatura, { cupomCodigo: codigo, cupomDesconto: desconto });
    await this.repo.update(fatura.id, {
      valor: 0,
      status: StatusFatura.PAGA,
      pagaEm: new Date(),
      observacao: `Cortesia integral pelo cupom ${codigo}`,
    });
    Object.assign(fatura, { valor: 0, status: StatusFatura.PAGA });

    this.logger.log(`Fatura ${fatura.id} zerada pelo cupom ${codigo} — nasce paga, sem cobrança`);
    return this.resultado(fatura, true, `Cortesia integral pelo cupom ${codigo}`);
  }

  /** O cupom desta fatura, se o cliente tiver um em aberto que ainda valha. */
  private cupomDaFatura(
    fatura: AssinaturaFatura,
    sacado: { tipo: 'condominio' | 'administradora'; id: string },
    customerId: string,
  ) {
    return this.cupom.resolver(fatura, sacado, customerId);
  }

  /**
   * Espelha a baixa manual no gateway.
   *
   * **A baixa local já aconteceu quando isto roda**, e é de propósito: dinheiro
   * que entrou não pode ficar refém de uma API fora do ar. Falhando aqui, a
   * fatura fica marcada como dessincronizada e a conciliação resolve depois.
   */
  async espelharBaixa(fatura: AssinaturaFatura): Promise<void> {
    // O cliente pagou: destrava **antes de qualquer outra coisa** e mesmo com o
    // gateway fora. Este é o passo que não pode ser pulado por causa de uma
    // falha de rede — ninguém deve ficar com a portaria travada depois de pagar.
    await this.esquecerBloqueio(fatura);

    if (!this.cobrancas.ligado || !fatura.cobrancaId) return;

    try {
      // Chave derivada do id da fatura: a baixa de uma fatura é um evento único,
      // então a mesma chave num retry é o comportamento correto.
      await this.cobrancas.receberEmDinheiro(fatura.cobrancaId, `baixa-${fatura.id}`);
      await this.marcar(fatura, { cobrancaDessincronizada: false, sincronizadoEm: new Date() });
    } catch (err) {
      this.logger.warn(
        `Baixa da fatura ${fatura.id} não chegou ao gateway: ${(err as Error).message}`,
      );
      await this.marcar(fatura, { cobrancaDessincronizada: true });
    }
  }

  /**
   * Cancela a cobrança no gateway **antes** de marcar a fatura localmente.
   *
   * Aqui a ordem é a inversa da baixa, e o motivo é o risco de cada lado:
   * cancelar só do nosso lado deixaria uma cobrança viva que o cliente pode
   * pagar por engano. Então esta falha **impede** o cancelamento local, e quem
   * chamou recebe o erro.
   */
  async cancelarCobranca(fatura: AssinaturaFatura): Promise<void> {
    if (!this.cobrancas.ligado || !fatura.cobrancaId) return;

    await this.cobrancas.cancelar(fatura.cobrancaId);
    await this.marcar(fatura, {
      cobrancaStatus: StatusCobranca.CANCELADA,
      sincronizadoEm: new Date(),
    });
  }

  /** As faturas que ainda precisam de cobrança — o que a fila consome. */
  async pendentesDeEmissao(limite = 200): Promise<string[]> {
    const faturas = await this.repo.find({
      where: {
        cobrancaStatus: In([
          StatusCobranca.PENDENTE,
          StatusCobranca.ERRO,
          StatusCobranca.DESLIGADA,
        ]),
        status: In([StatusFatura.ABERTA, StatusFatura.VENCIDA]),
      },
      select: { id: true },
      order: { vencimento: 'ASC' },
      take: limite,
    });
    return faturas.map((f) => f.id);
  }

  /**
   * Aplica ao nosso estado o que o gateway diz. Devolve se algo mudou.
   *
   * Usado pelo webhook e pela conciliação — os dois caminhos pelos quais uma
   * fatura muda **sem ação nossa**. Três regras moram aqui:
   *
   * 1. **Status desconhecido não mexe no nosso.** Guarda o bruto e segue. Um
   *    enum novo do lado deles não pode derrubar o processamento.
   * 2. **Precedência, não ordem de chegada.** `RECEIVED` pode chegar antes de
   *    `CONFIRMED`, e um `PENDING` atrasado depois da baixa. Nunca voltar de
   *    `paga` para `aberta` por causa de um evento velho.
   * 3. **`paga` exige `pagaEm`.** É CHECK no banco (`chk_assinatura_faturas_paga`)
   *    e faz sentido: fatura paga sem data de pagamento não se explica depois.
   */
  async aplicarEstadoDoGateway(fatura: AssinaturaFatura, statusGateway: string): Promise<boolean> {
    await this.marcar(fatura, {
      cobrancaStatusGateway: statusGateway,
      sincronizadoEm: new Date(),
      // O gateway confirmou o estado: o que estivesse pendente de espelho já
      // chegou lá (ou nunca vai, e a informação de lá é a que vale).
      cobrancaDessincronizada: false,
    });

    const novo = statusDaFatura(statusGateway);
    if (!novo) {
      this.logger.warn(
        `Status "${statusGateway}" desconhecido na fatura ${fatura.id}; guardei o bruto e não mexi no nosso`,
      );
      return false;
    }

    if (!deveAvancar(fatura.status, novo)) return false;

    const campos: Partial<Pick<AssinaturaFatura, 'status' | 'pagaEm'>> = { status: novo };
    if (novo === StatusFatura.PAGA && !fatura.pagaEm) campos.pagaEm = new Date();

    Object.assign(fatura, campos);
    await this.repo.update(fatura.id, campos);
    this.logger.log(`Fatura ${fatura.id}: ${statusGateway} do gateway → ${novo}`);

    await this.esquecerBloqueio(fatura);
    return true;
  }

  /**
   * Limpa o cache de bloqueio do cliente desta fatura.
   *
   * **Sem isto, quem acabou de pagar espera o TTL para voltar a trabalhar** —
   * cinco minutos olhando uma tela travada depois de ter pago é a pior
   * experiência que este sistema pode oferecer.
   *
   * Best-effort: falhar aqui só faz o desbloqueio demorar o TTL, então não pode
   * derrubar a baixa que acabou de acontecer.
   */
  async esquecerBloqueio(fatura: AssinaturaFatura): Promise<void> {
    try {
      const cliente = fatura.tenantId
        ? ({ tipo: 'condominio', id: fatura.tenantId } as const)
        : ({ tipo: 'administradora', id: fatura.administradoraId! } as const);
      const vinculo = await this.clientes.vinculoDe(cliente.tipo, cliente.id);
      await this.acesso.esquecer(vinculo?.customerId);
    } catch (err) {
      this.logger.warn(`Não deu para limpar o cache de bloqueio: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ auxílio

  /**
   * O que impede uma fatura de virar cobrança, antes de gastar rede.
   *
   * Fatura paga ou cancelada não se cobra — parece óbvio, mas a fila pode pegar
   * uma fatura que mudou de estado entre o enfileiramento e o processamento.
   * Valor zero também não: o gateway não emite cobrança de R$ 0,00.
   */
  private impedimentoDeEmissao(fatura: AssinaturaFatura): string | null {
    if (fatura.status === StatusFatura.PAGA) return 'Fatura já está paga';
    if (fatura.status === StatusFatura.CANCELADA) return 'Fatura cancelada não gera cobrança';
    if (fatura.valor <= 0) {
      return 'Fatura de valor zero não vira cobrança (cortesia já está registrada na própria fatura)';
    }
    return null;
  }

  /** `Chegou · assinatura 04/2026 · Edifício Solar` — o que o cliente lê no extrato. */
  private async descricao(fatura: AssinaturaFatura): Promise<string> {
    const completa = await this.repo.findOne({
      where: { id: fatura.id },
      relations: { tenant: true, administradora: true },
    });
    const nome = completa?.tenant?.nome ?? completa?.administradora?.nome ?? 'cliente';
    return `Chegou · assinatura ${competenciaLegivel(fatura.competencia)} · ${nome}`;
  }

  /**
   * Grava as colunas de cobrança — **e só elas**.
   *
   * O tipo é restrito de propósito: este serviço não tem o que fazer com
   * `valor`, `status` ou `competencia`. A fatura é fotografia do que foi
   * cobrado, e a emissão não pode reescrever o que ela diz.
   */
  private async marcar(fatura: AssinaturaFatura, campos: CamposDeCobranca): Promise<void> {
    Object.assign(fatura, campos);
    await this.repo.update(fatura.id, campos);
  }

  private marcarErro(fatura: AssinaturaFatura, motivo: string): Promise<void> {
    return this.marcar(fatura, {
      cobrancaStatus: StatusCobranca.ERRO,
      cobrancaErro: motivo.slice(0, 500),
    });
  }

  private resultado(fatura: AssinaturaFatura, ok: boolean, detalhe?: string): ResultadoEmissao {
    return {
      ok,
      faturaId: fatura.id,
      cobrancaId: fatura.cobrancaId,
      invoiceUrl: fatura.invoiceUrl,
      status: fatura.cobrancaStatus,
      ...(detalhe ? { detalhe } : {}),
    };
  }
}
