import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { OpenwaService, WhatsappTenantConfig } from './openwa.service';
import { AtualizarTemplateDto } from './dto/atualizar-template.dto';

/** Config de disparo/template do próprio condomínio (síndico/admin). */
@Controller('whatsapp/config')
@Roles('sindico', 'admin')
export class OpenwaConfigController {
  constructor(private readonly service: OpenwaService) {}

  @Get()
  obter(@TenantId() tenantId: string): Promise<WhatsappTenantConfig> {
    return this.service.getWhatsappConfig(tenantId);
  }

  @Patch()
  atualizar(
    @TenantId() tenantId: string,
    @Body() dto: AtualizarTemplateDto,
  ): Promise<WhatsappTenantConfig> {
    return this.service.updateTemplateEncomenda(tenantId, dto.templateEncomenda);
  }
}
