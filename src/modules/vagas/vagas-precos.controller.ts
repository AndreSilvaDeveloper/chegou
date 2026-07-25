import { Body, Controller, Get, Put } from '@nestjs/common';
import { RequiresModule, Roles, TenantId } from '../../common/decorators';
import { DefinirPrecosDto } from './dto/definir-precos.dto';
import { VagasPrecosService } from './vagas-precos.service';

@Controller('vagas-precos')
@RequiresModule('vagas')
export class VagasPrecosController {
  constructor(private readonly service: VagasPrecosService) {}

  @Get()
  @Roles('admin', 'sindico')
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  /** Substitui a tabela inteira — tipo omitido deixa de ter preço. */
  @Put()
  @Roles('admin', 'sindico')
  definir(@TenantId() tenantId: string, @Body() dto: DefinirPrecosDto) {
    return this.service.definir(tenantId, dto);
  }
}
