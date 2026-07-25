import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequiresModule, Roles, TenantId } from '../../common/decorators';
import { VagasCobrancasService } from './vagas-cobrancas.service';
import {
  AtualizarCobrancaDto,
  CancelarCobrancaDto,
  GerarCobrancasDto,
  QueryCobrancasDto,
  RegistrarPagamentoDto,
} from './dto/cobrancas.dto';

@Controller('vagas-cobrancas')
@RequiresModule('vagas')
@Roles('admin', 'sindico')
export class VagasCobrancasController {
  constructor(private readonly service: VagasCobrancasService) {}

  @Get()
  listar(@TenantId() tenantId: string, @Query() query: QueryCobrancasDto) {
    return this.service.listar(tenantId, query);
  }

  @Get('resumo')
  resumo(@TenantId() tenantId: string, @Query('competencia') competencia?: string) {
    return this.service.resumo(tenantId, competencia);
  }

  // Antes de ':id' — rota fixa não pode ser capturada pelo curinga.
  @Get(':id')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  /** Gera as cobranças da competência. Rodar de novo não duplica. */
  @Post('gerar')
  gerar(@TenantId() tenantId: string, @Body() dto: GerarCobrancasDto) {
    return this.service.gerar(tenantId, dto);
  }

  /** Envia a cobrança ao responsável (WhatsApp pela fila anti-bloqueio). */
  @Post(':id/enviar')
  enviar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.enviar(tenantId, id);
  }

  @Post(':id/pagar')
  registrarPagamento(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarPagamentoDto,
  ) {
    return this.service.registrarPagamento(tenantId, id, dto);
  }

  @Post(':id/cancelar')
  cancelar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarCobrancaDto,
  ) {
    return this.service.cancelar(tenantId, id, dto);
  }

  @Patch(':id')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarCobrancaDto,
  ) {
    return this.service.atualizar(tenantId, id, dto);
  }
}
