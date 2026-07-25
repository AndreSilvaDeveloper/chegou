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
import { RequiresModule, Roles, TenantId } from '../../common/decorators';
import { VagasService } from './vagas.service';
import { CriarVagaDto } from './dto/criar-vaga.dto';
import { AtualizarVagaDto } from './dto/atualizar-vaga.dto';

@Controller('vagas')
@RequiresModule('vagas')
export class VagasController {
  constructor(private readonly service: VagasService) {}

  @Get()
  @Roles('admin', 'sindico', 'porteiro')
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  /** Pool de locação: vagas ativas, sem apartamento e sem contrato vigente. */
  @Get('disponiveis')
  @Roles('admin', 'sindico')
  listarDisponiveis(@TenantId() tenantId: string) {
    return this.service.listarDisponiveis(tenantId);
  }

  // Depois de 'disponiveis' — rota curinga não pode capturar o path fixo.
  @Get(':id')
  @Roles('admin', 'sindico', 'porteiro')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(@TenantId() tenantId: string, @Body() dto: CriarVagaDto) {
    return this.service.criar(tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'sindico')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarVagaDto,
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
