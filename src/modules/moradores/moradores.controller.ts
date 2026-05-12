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
import { AtualizarMoradorDto } from './dto/atualizar-morador.dto';
import { CriarMoradorDto } from './dto/criar-morador.dto';
import { ListarMoradoresQuery } from './dto/listar-moradores.query';
import { MoradoresService } from './moradores.service';

@Controller('moradores')
export class MoradoresController {
  constructor(private readonly service: MoradoresService) {}

  @Get()
  @Roles('porteiro', 'admin', 'sindico')
  listar(@TenantId() tenantId: string, @Query() q: ListarMoradoresQuery) {
    return this.service.listar(tenantId, q);
  }

  @Get(':id')
  @Roles('porteiro', 'admin', 'sindico')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(@TenantId() tenantId: string, @Body() dto: CriarMoradorDto) {
    return this.service.criar(tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'sindico')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarMoradorDto,
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
