import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AdministradoraId, Roles } from '../../common/decorators';
import { CriarTenantDto } from '../admin/dto/criar-tenant.dto';
import { AdministradorasService } from './administradoras.service';
import { AtualizarCondominioDto } from './dto/condominio.dto';

/**
 * A visão da própria administradora.
 *
 * Nenhuma rota aqui recebe o id da carteira: ele vem sempre do usuário logado
 * (`@AdministradoraId()`), então não existe id para adulterar na URL.
 */
@Controller('minha-administradora')
@Roles('admin')
export class MinhaAdministradoraController {
  constructor(private readonly service: AdministradorasService) {}

  @Get()
  obter(@AdministradoraId() administradoraId: string) {
    return this.service.obterPropria(administradoraId);
  }

  @Get('condominios')
  listarCondominios(@AdministradoraId() administradoraId: string) {
    return this.service.listarCondominios(administradoraId);
  }

  @Get('condominios/:tenantId')
  obterCondominio(
    @AdministradoraId() administradoraId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    return this.service.obterCondominioDaCarteira(administradoraId, tenantId);
  }

  @Post('condominios')
  criarCondominio(@AdministradoraId() administradoraId: string, @Body() dto: CriarTenantDto) {
    return this.service.criarCondominio(administradoraId, dto);
  }

  @Patch('condominios/:tenantId')
  atualizarCondominio(
    @AdministradoraId() administradoraId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AtualizarCondominioDto,
  ) {
    return this.service.atualizarCondominio(administradoraId, tenantId, dto);
  }

  @Get('usuarios')
  listarUsuarios(@AdministradoraId() administradoraId: string) {
    return this.service.listarUsuarios(administradoraId);
  }
}
