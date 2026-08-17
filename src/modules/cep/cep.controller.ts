import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { CepService } from './cep.service';

/**
 * Consulta de CEP — uma conveniência de preenchimento, não uma fonte de dados.
 *
 * **Não é `@Public()`.** A rota não devolve nada de ninguém (CEP é informação
 * pública), mas aberta ela vira um proxy de graça para a BrasilAPI/ViaCEP em
 * cima da nossa cota e do nosso IP — e é o nosso IP que leva o bloqueio quando
 * alguém decidir varrer os CEPs do Brasil por aqui.
 *
 * Os três perfis são exatamente os que editam o endereço de um condomínio:
 * síndico (`/configuracoes`), administradora (`/meus-condominios/:id`) e
 * superadmin (`/admin/condominios/:id`). Porteiro fica de fora — ele não tem
 * tela de cadastro de condomínio.
 *
 * Sem `@TenantId()` de propósito: o CEP não é dado de condomínio nenhum, e
 * exigir escopo obrigaria a administradora a escolher um condomínio antes de
 * cadastrar o endereço do condomínio novo que ela está criando.
 */
@Controller('cep')
@Roles('sindico', 'admin', 'superadmin')
export class CepController {
  constructor(private readonly service: CepService) {}

  @Get(':cep')
  consultar(@Param('cep') cep: string) {
    return this.service.consultar(cep);
  }
}
