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
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { UserRole } from '../../database/entities';
import { AtualizarApartamentoDto } from '../apartamentos/dto/atualizar-apartamento.dto';
import { CriarApartamentoDto } from '../apartamentos/dto/criar-apartamento.dto';
import { ApartamentosService } from '../apartamentos/apartamentos.service';
import { AtualizarMoradorDto } from '../moradores/dto/atualizar-morador.dto';
import { CriarMoradorDto } from '../moradores/dto/criar-morador.dto';
import { ListarMoradoresQuery } from '../moradores/dto/listar-moradores.query';
import { MoradoresService } from '../moradores/moradores.service';
import { AtualizarUsuarioDto } from '../usuarios/dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from '../usuarios/dto/criar-usuario.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AdminService } from './admin.service';

/** Papéis que o superadmin pode criar/atribuir dentro de um condomínio. */
const ROLES_SUPERADMIN: UserRole[] = ['porteiro', 'sindico', 'admin'];

/**
 * Permite ao superadmin gerenciar os recursos de um condomínio específico
 * (usuários, apartamentos, moradores) sem precisar de uma conta dentro dele.
 */
@Controller('admin/tenants/:tenantId')
@Roles('superadmin')
export class AdminTenantManagementController {
  constructor(
    private readonly admin: AdminService,
    private readonly usuarios: UsuariosService,
    private readonly moradores: MoradoresService,
    private readonly apartamentos: ApartamentosService,
  ) {}

  private async ensureTenant(tenantId: string): Promise<void> {
    await this.admin.assertTenantExists(tenantId);
  }

  // ---------------- usuários ----------------
  @Get('usuarios')
  async listarUsuarios(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    await this.ensureTenant(tenantId);
    return this.usuarios.listar(tenantId);
  }

  @Post('usuarios')
  async criarUsuario(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CriarUsuarioDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.usuarios.criar(tenantId, dto, ROLES_SUPERADMIN);
  }

  @Patch('usuarios/:userId')
  async atualizarUsuario(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AtualizarUsuarioDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.usuarios.atualizar(tenantId, userId, dto, ROLES_SUPERADMIN);
  }

  @Delete('usuarios/:userId')
  @HttpCode(200)
  async desativarUsuario(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.ensureTenant(tenantId);
    return this.usuarios.desativar(tenantId, userId);
  }

  // ---------------- apartamentos ----------------
  @Get('apartamentos')
  async listarApartamentos(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('q') q?: string,
  ) {
    await this.ensureTenant(tenantId);
    return this.apartamentos.listar(tenantId, q);
  }

  @Get('apartamentos/:aptoId/moradores')
  async moradoresDoApto(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('aptoId', ParseUUIDPipe) aptoId: string,
  ) {
    await this.ensureTenant(tenantId);
    return this.apartamentos.listarMoradores(tenantId, aptoId);
  }

  @Post('apartamentos')
  async criarApartamento(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CriarApartamentoDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.apartamentos.criar(tenantId, dto);
  }

  @Patch('apartamentos/:aptoId')
  async atualizarApartamento(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('aptoId', ParseUUIDPipe) aptoId: string,
    @Body() dto: AtualizarApartamentoDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.apartamentos.atualizar(tenantId, aptoId, dto);
  }

  @Delete('apartamentos/:aptoId')
  @HttpCode(200)
  async desativarApartamento(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('aptoId', ParseUUIDPipe) aptoId: string,
  ) {
    await this.ensureTenant(tenantId);
    return this.apartamentos.desativar(tenantId, aptoId);
  }

  // ---------------- moradores ----------------
  @Get('moradores')
  async listarMoradores(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() q: ListarMoradoresQuery,
  ) {
    await this.ensureTenant(tenantId);
    return this.moradores.listar(tenantId, q);
  }

  @Post('moradores')
  async criarMorador(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CriarMoradorDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.moradores.criar(tenantId, dto);
  }

  @Patch('moradores/:moradorId')
  async atualizarMorador(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('moradorId', ParseUUIDPipe) moradorId: string,
    @Body() dto: AtualizarMoradorDto,
  ) {
    await this.ensureTenant(tenantId);
    return this.moradores.atualizar(tenantId, moradorId, dto);
  }

  @Delete('moradores/:moradorId')
  @HttpCode(200)
  async desativarMorador(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('moradorId', ParseUUIDPipe) moradorId: string,
  ) {
    await this.ensureTenant(tenantId);
    return this.moradores.desativar(tenantId, moradorId);
  }
}
