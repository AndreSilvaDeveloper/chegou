import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { AdminService } from './admin.service';
import { AtualizarTenantDto } from './dto/atualizar-tenant.dto';
import { CriarTenantDto } from './dto/criar-tenant.dto';

@Controller('admin/tenants')
@Roles('superadmin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get()
  listar() {
    return this.service.listarTenants();
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obterTenant(id);
  }

  @Post()
  criar(@Body() dto: CriarTenantDto) {
    return this.service.criarTenant(dto);
  }

  @Patch(':id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarTenantDto) {
    return this.service.atualizarTenant(id, dto);
  }
}
