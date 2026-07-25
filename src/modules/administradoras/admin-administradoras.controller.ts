import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { CriarTenantDto } from '../admin/dto/criar-tenant.dto';
import { AdministradorasService } from './administradoras.service';
import {
  AtualizarAdministradoraDto,
  CriarAdministradoraDto,
  CriarUsuarioAdminDto,
  VincularCondominioDto,
} from './dto/administradora.dto';

/** Gestão das administradoras — só o dono da plataforma. */
@Controller('admin/administradoras')
@Roles('superadmin')
export class AdminAdministradorasController {
  constructor(private readonly service: AdministradorasService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  /** Antes de ':id' — rota fixa não pode ser capturada pelo curinga. */
  @Get('condominios-sem-carteira')
  listarSemCarteira() {
    return this.service.listarCondominiosSemCarteira();
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(id);
  }

  @Post()
  criar(@Body() dto: CriarAdministradoraDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarAdministradoraDto) {
    return this.service.atualizar(id, dto);
  }

  // ---------------- carteira ----------------

  @Get(':id/condominios')
  listarCondominios(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listarCondominios(id);
  }

  /** Cria um condomínio já dentro da carteira desta administradora. */
  @Post(':id/condominios')
  criarCondominio(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CriarTenantDto) {
    return this.service.criarCondominio(id, dto);
  }

  /** Move um condomínio existente para esta carteira. */
  @Post(':id/condominios/vincular')
  @HttpCode(200)
  vincular(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VincularCondominioDto) {
    return this.service.vincularCondominio(id, dto.tenantId);
  }

  @Delete(':id/condominios/:tenantId')
  @HttpCode(200)
  desvincular(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ) {
    return this.service.desvincularCondominio(tenantId);
  }

  // ---------------- usuários da administradora ----------------

  @Get(':id/usuarios')
  listarUsuarios(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listarUsuarios(id);
  }

  @Post(':id/usuarios')
  criarUsuario(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CriarUsuarioAdminDto) {
    return this.service.criarUsuario(id, dto);
  }

  @Delete(':id/usuarios/:userId')
  @HttpCode(200)
  desativarUsuario(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.desativarUsuario(id, userId);
  }
}
