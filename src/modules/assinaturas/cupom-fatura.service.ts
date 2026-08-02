import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, IsNull, Or, Repository } from 'typeorm';
import { AssinaturaCupomCliente, AssinaturaFatura } from '../../database/entities';
import { CuponsService } from '../pagamentos/cupons.service';
import type { TipoCliente } from './assinatura-clientes.service';

/** O cupom já resolvido para uma fatura. */
export interface CupomAplicado {
  codigo: string;
  desconto: number;
  /** O valor **sem** o cupom. É ele que vai para o gateway. */
  valorSemCupom: number;
  /** O valor com o cupom. É ele que a fatura passa a dizer. */
  valorLiquido: number;
}

/** Duas casas: somar float acumula centavo fantasma. */
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * O cupom aplicado a uma fatura.
 *
 * ## A armadilha que este arquivo inteiro existe para evitar
 *
 * **O desconto não pode nascer na cobrança.** Se mandássemos só o `couponCode`
 * e deixássemos a API descontar, a fatura diria R$ 418,80 e a cobrança cobraria
 * R$ 376,92. Três coisas quebrariam de uma vez: o cliente veria na tela um
 * número que não é o que ele paga, o resumo do superadmin reportaria faturado
 * maior que recebido **todo mês**, e a conciliação acusaria divergência de valor
 * — um alarme falso mensal, que é a maneira mais rápida de ninguém mais olhar
 * para os alarmes.
 *
 * A ordem correta tem três passos, e nenhum pode ser pulado:
 *
 * ```
 * 1. validar  → discountAmount, finalValue
 * 2. gravar na fatura: cupom_codigo, cupom_desconto, valor = finalValue
 * 3. cobrar   → value = valor SEM o cupom + couponCode
 *               confere: charge.value == fatura.valor?
 * ```
 *
 * > **Mandamos o valor bruto + o código.** Mandar o valor já descontado *e* o
 * > código aplica o desconto **duas vezes**. É o bug de dinheiro mais fácil de
 * > escrever nesta integração, e tem teste dedicado.
 *
 * ## Por que na emissão, e não na geração
 *
 * Validar cupom é chamada de rede, e **a geração mensal não pode depender de
 * rede** (é a regra que impede um timeout de custar um mês de faturamento). A
 * fatura nasce pelo valor cheio; o cupom entra na emissão, que já é a fila com
 * retry. Isso é permitido porque ali a fatura ainda está em
 * `cobranca_status = 'pendente'` — ela nunca foi cobrada. Fatura **emitida**
 * continua sendo fotografia intocável.
 */
@Injectable()
export class CupomFaturaService {
  private readonly logger = new Logger(CupomFaturaService.name);

  constructor(
    @InjectRepository(AssinaturaCupomCliente)
    private readonly repo: Repository<AssinaturaCupomCliente>,
    private readonly cupons: CuponsService,
  ) {}

  /**
   * Atribui um cupom a um cliente.
   *
   * Encerra a atribuição anterior na mesma transação: o índice parcial só
   * aceita **uma em aberto por cliente**, e dois cupons ativos exigiriam uma
   * regra de desempate que ninguém lembraria seis meses depois.
   */
  async atribuir(dados: {
    tipo: TipoCliente;
    clienteId: string;
    codigo: string;
    aplicarAte?: string;
    observacao?: string;
  }): Promise<AssinaturaCupomCliente> {
    const dono =
      dados.tipo === 'condominio'
        ? { tenantId: dados.clienteId, administradoraId: null }
        : { administradoraId: dados.clienteId, tenantId: null };

    await this.remover(dados.tipo, dados.clienteId);

    return this.repo.save(
      this.repo.create({
        ...dono,
        codigo: dados.codigo.toUpperCase(),
        // `YYYY-MM` vira `YYYY-MM-01`: a competência é sempre o dia 1, como no
        // resto do módulo, e comparar com dias diferentes daria falso negativo.
        aplicarAte: dados.aplicarAte ? `${dados.aplicarAte}-01` : null,
        observacao: dados.observacao ?? null,
        ativo: true,
      }),
    );
  }

  /** Tira o cupom do cliente. Desativa, não apaga: o histórico explica o passado. */
  async remover(tipo: TipoCliente, clienteId: string): Promise<void> {
    const dono = tipo === 'condominio' ? { tenantId: clienteId } : { administradoraId: clienteId };
    await this.repo.update({ ...dono, ativo: true }, { ativo: false });
  }

  /** As atribuições em aberto, para a tela. */
  listarAtribuicoes(): Promise<AssinaturaCupomCliente[]> {
    return this.repo.find({ where: { ativo: true }, order: { createdAt: 'DESC' } });
  }

  /** O cupom em aberto de um cliente, se houver e se ainda valer nesta competência. */
  async cupomDoCliente(
    tipo: TipoCliente,
    id: string,
    competencia: string,
  ): Promise<AssinaturaCupomCliente | null> {
    const cupom = await this.repo.findOne({
      where: {
        ...(tipo === 'condominio' ? { tenantId: id } : { administradoraId: id }),
        ativo: true,
      },
    });
    if (!cupom) return null;

    // `aplicar_ate` é o freio do nosso lado: o limite de uso é do gateway, mas
    // "este cliente para de receber em junho" é decisão comercial nossa.
    if (cupom.aplicarAte && competencia > cupom.aplicarAte) return null;
    return cupom;
  }

  /**
   * Resolve o cupom para uma fatura. `null` = sem cupom, cobra o valor cheio.
   *
   * Toda dúvida devolve `null`: sem cupom atribuído, cupom fora da validade,
   * gateway que não respondeu, resposta sem desconto. **Errar para mais é
   * conserto de um clique; errar para menos é dinheiro que não volta.**
   */
  async resolver(
    fatura: AssinaturaFatura,
    cliente: { tipo: TipoCliente; id: string },
    customerId: string,
  ): Promise<CupomAplicado | null> {
    const atribuido = await this.cupomDoCliente(cliente.tipo, cliente.id, fatura.competencia);
    if (!atribuido) return null;

    const validacao = await this.cupons.validar(atribuido.codigo, customerId, fatura.valor);
    if (!validacao) return null;

    if (!validacao.valid) {
      this.logger.warn(
        `Cupom ${atribuido.codigo} recusado para a fatura ${fatura.id}: ${validacao.message}`,
      );
      return null;
    }

    const desconto = centavos(validacao.discountAmount ?? 0);
    if (desconto <= 0) return null;

    // `finalValue` é o que eles calcularam. Usamos o número **deles**, não uma
    // subtração nossa: se as duas contas divergirem por arredondamento, quem
    // manda é quem vai descontar de verdade.
    const valorLiquido = centavos(validacao.finalValue ?? fatura.valor - desconto);

    return {
      codigo: atribuido.codigo,
      desconto,
      valorSemCupom: fatura.valor,
      valorLiquido,
    };
  }
}
