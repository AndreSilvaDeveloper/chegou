import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AdministradoraId, Roles, TenantId } from '../../common/decorators';
import { AssinaturaFaturasService } from './assinatura-faturas.service';

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
}
