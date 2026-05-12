import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Roles, TenantId } from '../../common/decorators';
import { AuthenticatedUser } from '../auth/types';
import { CancelarEncomendaDto } from './dto/cancelar-encomenda.dto';
import { CriarEncomendaDto } from './dto/criar-encomenda.dto';
import { ListarEncomendasQuery } from './dto/listar-encomendas.query';
import { RetirarEncomendaDto } from './dto/retirar-encomenda.dto';
import { EncomendasService } from './encomendas.service';

@Controller('encomendas')
export class EncomendasController {
  constructor(private readonly service: EncomendasService) {}

  @Post()
  @Roles('porteiro', 'admin', 'sindico')
  criar(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CriarEncomendaDto,
  ) {
    return this.service.criar(tenantId, user.id, dto);
  }

  @Get()
  @Roles('porteiro', 'admin', 'sindico')
  listar(@TenantId() tenantId: string, @Query() q: ListarEncomendasQuery) {
    return this.service.listar(tenantId, q);
  }

  @Get('export.csv')
  @Roles('admin', 'sindico')
  async exportCsv(
    @TenantId() tenantId: string,
    @Query() q: ListarEncomendasQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.service.exportarCsv(tenantId, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="encomendas-${Date.now()}.csv"`);
    return csv;
  }

  @Get(':id')
  @Roles('porteiro', 'admin', 'sindico')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post(':id/retirar')
  @Roles('porteiro', 'admin', 'sindico')
  @HttpCode(200)
  retirar(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetirarEncomendaDto,
  ) {
    return this.service.retirar(tenantId, user.id, id, dto);
  }

  @Post(':id/cancelar')
  @Roles('admin', 'sindico')
  @HttpCode(200)
  cancelar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarEncomendaDto,
  ) {
    return this.service.cancelar(tenantId, id, dto);
  }
}
