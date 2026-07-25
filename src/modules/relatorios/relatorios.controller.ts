import { Controller, Get, Query } from '@nestjs/common';
import { RequiresModule, Roles, TenantId } from '../../common/decorators';
import { RelatorioQuery } from './dto/relatorio.query';
import { RelatoriosService } from './relatorios.service';

@Controller('relatorios')
@Roles('admin', 'sindico')
export class RelatoriosController {
  constructor(private readonly service: RelatoriosService) {}

  /** Operação da portaria: volume, tempos, aging, picos e rankings. */
  @Get('encomendas')
  encomendas(@TenantId() tenantId: string, @Query() q: RelatorioQuery) {
    return this.service.encomendas(tenantId, q);
  }

  /** Saúde dos disparos WhatsApp e alcance do cadastro de moradores. */
  @Get('whatsapp')
  whatsapp(@TenantId() tenantId: string, @Query() q: RelatorioQuery) {
    return this.service.whatsapp(tenantId, q);
  }

  /** Ocupação das vagas e receita das locações (snapshot atual). */
  @Get('vagas')
  @RequiresModule('vagas')
  vagas(@TenantId() tenantId: string) {
    return this.service.vagas(tenantId);
  }
}
