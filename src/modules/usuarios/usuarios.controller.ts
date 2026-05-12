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
import { Roles, TenantId } from '../../common/decorators';
import { UserRole } from '../../database/entities';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { UsuariosService } from './usuarios.service';

/** Papéis que um síndico/admin de condomínio pode criar ou atribuir. */
export const ROLES_GERENCIAVEIS_PELO_TENANT: UserRole[] = ['porteiro', 'sindico'];

@Controller('usuarios')
@Roles('sindico', 'admin')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  @Get(':id')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  criar(@TenantId() tenantId: string, @Body() dto: CriarUsuarioDto) {
    return this.service.criar(tenantId, dto, ROLES_GERENCIAVEIS_PELO_TENANT);
  }

  @Patch(':id')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarUsuarioDto,
  ) {
    return this.service.atualizar(tenantId, id, dto, ROLES_GERENCIAVEIS_PELO_TENANT);
  }

  @Delete(':id')
  @HttpCode(200)
  desativar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desativar(tenantId, id);
  }
}
