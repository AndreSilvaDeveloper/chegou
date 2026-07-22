import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { VagasLocacaoService } from './vagas-locacao.service';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { AtualizarLocacaoDto } from './dto/atualizar-locacao.dto';

@Controller('vagas-locacao')
export class VagasLocacaoController {
  constructor(private readonly service: VagasLocacaoService) {}

  @Get()
  @Roles('admin', 'sindico')
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'sindico')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(@TenantId() tenantId: string, @Body() dto: CriarLocacaoDto) {
    return this.service.criar(tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'sindico')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarLocacaoDto,
  ) {
    return this.service.atualizar(tenantId, id, dto);
  }

  @Post(':id/encerrar')
  @Roles('admin', 'sindico')
  encerrar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.encerrar(tenantId, id);
  }
}
