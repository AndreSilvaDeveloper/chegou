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
import { Roles, TenantId } from '../../common/decorators';
import { ApartamentosService } from './apartamentos.service';
import { AtualizarApartamentoDto } from './dto/atualizar-apartamento.dto';
import { CriarApartamentoDto } from './dto/criar-apartamento.dto';

@Controller('apartamentos')
export class ApartamentosController {
  constructor(private readonly service: ApartamentosService) {}

  @Get()
  @Roles('porteiro', 'admin', 'sindico')
  listar(@TenantId() tenantId: string, @Query('q') q?: string) {
    return this.service.listar(tenantId, q);
  }

  @Get(':id')
  @Roles('porteiro', 'admin', 'sindico')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Get(':id/moradores')
  @Roles('porteiro', 'admin', 'sindico')
  moradores(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listarMoradores(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(@TenantId() tenantId: string, @Body() dto: CriarApartamentoDto) {
    return this.service.criar(tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'sindico')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarApartamentoDto,
  ) {
    return this.service.atualizar(tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'sindico')
  @HttpCode(200)
  desativar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desativar(tenantId, id);
  }
}
