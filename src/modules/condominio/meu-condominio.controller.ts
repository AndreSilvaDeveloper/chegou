import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { AtualizarMeuCondominioDto } from './dto/atualizar-meu-condominio.dto';
import { MeuCondominioService } from './meu-condominio.service';

/**
 * O condomínio visto por quem está dentro dele.
 *
 * **Nenhuma rota aqui recebe o id do condomínio**: ele vem do
 * `TenantScopeGuard` (`@TenantId()`), que para o síndico o resolve pelo vínculo
 * do usuário. Não existe id para adulterar na URL — é o mesmo desenho de
 * `/minha-administradora`.
 *
 * Só `sindico`. O porteiro não configura o condomínio, a administradora já tem
 * a mesma tela em `/meus-condominios/:id` (pela carteira) e o superadmin, em
 * `/admin/condominios/:id` — com poderes maiores.
 */
@Controller('meu-condominio')
@Roles('sindico')
export class MeuCondominioController {
  constructor(private readonly service: MeuCondominioService) {}

  @Get()
  obter(@TenantId() tenantId: string) {
    return this.service.obter(tenantId);
  }

  @Patch()
  atualizar(@TenantId() tenantId: string, @Body() dto: AtualizarMeuCondominioDto) {
    return this.service.atualizar(tenantId, dto);
  }
}
