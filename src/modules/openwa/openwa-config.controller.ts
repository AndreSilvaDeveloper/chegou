import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { OpenwaService, WhatsappTenantConfig } from './openwa.service';
import { AtualizarConfigWhatsappDto } from './dto/atualizar-config.dto';

/** Config de disparo/modelos de mensagem do próprio condomínio (síndico/admin). */
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
    @Body() dto: AtualizarConfigWhatsappDto,
  ): Promise<WhatsappTenantConfig> {
    return this.service.updateWhatsappConfig(tenantId, dto);
  }
}
