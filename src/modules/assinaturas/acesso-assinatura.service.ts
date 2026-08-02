import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { In, Repository } from 'typeorm';
import { AssinaturaFatura } from '../../database/entities';
import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import {
  AcessoAssinaturaService as Contrato,
  type SituacaoDeBloqueio,
} from '../../common/guards/acesso-assinatura.service';
import { AcessoService } from '../pagamentos/acesso.service';
import { AssinaturaClientesService } from './assinatura-clientes.service';
import { AssinaturasService } from './assinaturas.service';

/** Liberado é a resposta segura, e é a resposta de todo caminho de dúvida. */
const LIBERADO: SituacaoDeBloqueio = { liberado: true };

/**
 * Quem paga pela request, e se está em dia.
 *
 * Implementa o contrato que o guard global declara em `common/guards`. A
 * inversão existe para `common/` não depender de um módulo de domínio — aqui é
 * o único lugar do sistema que sabe que o condomínio de uma carteira é cobrado
 * pela administradora dele.
 *
 * **Fail-open em todos os caminhos.** Nenhum `catch` daqui devolve bloqueado.
 */
@Injectable()
export class AcessoAssinaturaImpl implements Contrato {
  private readonly logger = new Logger(AcessoAssinaturaImpl.name);

  constructor(
    @InjectRepository(AssinaturaFatura) private readonly faturaRepo: Repository<AssinaturaFatura>,
    private readonly acesso: AcessoService,
    private readonly assinaturas: AssinaturasService,
    private readonly clientes: AssinaturaClientesService,
  ) {}

  get ativo(): boolean {
    return this.acesso.ativo;
  }

  async situacaoDaRequest(req: Request): Promise<SituacaoDeBloqueio> {
    const usuario = (req as { user?: { role?: string; administradoraId?: string | null } }).user;
    const escopo = (req as { tenantScope?: { tenantId?: string | null } }).tenantScope;

    try {
      const cliente = await this.clienteQuePaga(usuario, escopo?.tenantId ?? null);
      if (!cliente) return LIBERADO;

      const vinculo = await this.clientes.vinculoDe(cliente.tipo, cliente.id);
      const situacao = await this.acesso.situacao(vinculo?.customerId);
      if (situacao.liberado) return LIBERADO;

      return {
        ...situacao,
        linkPagamento: await this.linkDaMaisAntiga(cliente),
        // A administradora resolve na conta da carteira; o síndico, na do
        // condomínio. Mandar o síndico para a tela da carteira seria mandá-lo
        // para um 403.
        telaAssinatura:
          cliente.tipo === 'administradora' ? '/minha-administradora/assinatura' : '/assinatura',
      };
    } catch (err) {
      this.logger.error(`Falha ao resolver o pagador (${(err as Error).message}) — liberando`);
      return LIBERADO;
    }
  }

  /**
   * Quem paga pela request.
   *
   * A administradora é resolvida pelo **vínculo do usuário**, não pelo
   * condomínio do header: ela opera dentro de um condomínio da carteira, mas
   * quem deve é ela. Já o síndico e o porteiro dependem do condomínio — e se
   * ele for de carteira, quem paga é a administradora dele.
   */
  private async clienteQuePaga(
    usuario: { role?: string; administradoraId?: string | null } | undefined,
    tenantId: string | null,
  ): Promise<{ tipo: 'condominio' | 'administradora'; id: string } | null> {
    if (usuario?.role === 'admin' && usuario.administradoraId) {
      return { tipo: 'administradora', id: usuario.administradoraId };
    }
    if (!tenantId) return null;

    const responsavel = await this.assinaturas.responsavelPeloCondominio(tenantId);
    return responsavel.via === 'administradora'
      ? { tipo: 'administradora', id: responsavel.administradoraId }
      : { tipo: 'condominio', id: responsavel.tenantId };
  }

  /**
   * O link da fatura mais antiga ainda em aberto.
   *
   * A mais antiga, e não a maior: é a que está vencida há mais tempo, e pagá-la
   * é o que costuma destravar o acesso primeiro. Sem link, a faixa ainda
   * aparece — só manda o cliente abrir a tela da assinatura.
   */
  private async linkDaMaisAntiga(cliente: {
    tipo: 'condominio' | 'administradora';
    id: string;
  }): Promise<string | null> {
    const fatura = await this.faturaRepo.findOne({
      where: {
        ...(cliente.tipo === 'condominio' ? { tenantId: cliente.id } : { administradoraId: cliente.id }),
        status: In([StatusFatura.VENCIDA, StatusFatura.ABERTA]),
      },
      order: { vencimento: 'ASC' },
    });
    return fatura?.invoiceUrl ?? null;
  }
}
