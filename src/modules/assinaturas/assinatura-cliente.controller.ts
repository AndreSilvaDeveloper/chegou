import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AdministradoraId, Roles, TenantId } from '../../common/decorators';
import { AssinaturaFaturasService } from './assinatura-faturas.service';
import { AssinaturasService } from './assinaturas.service';

/**
 * A assinatura vista pela **administradora**: a carteira inteira numa conta só.
 *
 * Nenhuma rota aqui recebe o id da carteira — ele vem sempre do usuário logado
 * (`@AdministradoraId()`), então não existe id para adulterar na URL.
 */
@Controller('minha-administradora/assinatura')
@Roles('admin')
export class MinhaAdministradoraAssinaturaController {
  constructor(private readonly faturas: AssinaturaFaturasService) {}

  /** A conta de agora + o histórico de faturas da carteira. */
  @Get()
  minhaConta(@AdministradoraId() administradoraId: string) {
    return this.faturas.minhaContaDaAdministradora(administradoraId);
  }

  @Get('faturas/:id')
  obterFatura(
    @AdministradoraId() administradoraId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.faturas.obterDaAdministradora(administradoraId, id);
  }

  /** O link de pagamento e o estado dele. Ver a nota no controller do síndico. */
  @Get('faturas/:id/pagamento')
  async pagamento(
    @AdministradoraId() administradoraId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return (await this.faturas.obterDaAdministradora(administradoraId, id)).pagamento;
  }
}

/**
 * A conta de **um condomínio da carteira**, para a administradora.
 *
 * Só leitura, e é a mesma resposta que o superadmin recebe — o que ela vê aqui
 * é quanto aquele condomínio pesa na fatura da carteira e o histórico dele.
 * Quem paga continua sendo ela: não há fatura própria do condomínio para operar.
 *
 * O `:tenantId` vem da URL, mas **a carteira não**: ela sai de
 * `@AdministradoraId()` e o condomínio é conferido contra ela. Condomínio de
 * outra carteira responde 404, nunca 403.
 */
@Controller('minha-administradora/condominios/:tenantId/assinatura')
@Roles('admin')
export class AdministradoraCondominioAssinaturaController {
  constructor(
    private readonly faturas: AssinaturaFaturasService,
    private readonly assinaturas: AssinaturasService,
  ) {}

  @Get()
  async conta(
    @AdministradoraId() administradoraId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    await this.assinaturas.assertCondominioDaCarteira(administradoraId, tenantId);
    return this.faturas.contaDoCondominio(tenantId);
  }
}

/**
 * A assinatura vista pelo **síndico**: a conta do próprio condomínio.
 *
 * Só o síndico entra aqui. A administradora tem a rota dela acima — a conta
 * dela é a da carteira, não a de um condomínio; e o superadmin opera pelas
 * rotas de plataforma, em `/admin/assinaturas`.
 *
 * Condomínio de carteira não tem conta própria: a resposta traz `conta: null` e
 * o responsável, para a tela dizer com quem é a cobrança.
 */
@Controller('assinatura')
@Roles('sindico')
export class AssinaturaCondominioController {
  constructor(private readonly faturas: AssinaturaFaturasService) {}

  @Get()
  minhaConta(@TenantId() tenantId: string) {
    return this.faturas.minhaContaDoCondominio(tenantId);
  }

  @Get('faturas/:id')
  obterFatura(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.faturas.obterDoTenant(tenantId, id);
  }

  /**
   * O link de pagamento e o estado dele — **não emite nada**.
   *
   * O cliente não opera cobrança; ele paga o que foi emitido. Esta rota existe
   * para o caso da fatura recém-gerada, cuja emissão ainda está na fila: a tela
   * consulta de novo em vez de mostrar um botão que não funciona.
   *
   * A situação já vem junto de cada fatura (campo `pagamento`) para o botão
   * "Pagar" existir na lista sem uma requisição por linha. As duas leem o mesmo
   * `situacaoDePagamento()`, então não têm como divergir.
   */
  @Get('faturas/:id/pagamento')
  async pagamento(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return (await this.faturas.obterDoTenant(tenantId, id)).pagamento;
  }
}
