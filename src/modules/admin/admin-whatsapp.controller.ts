import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { AdminWhatsappService } from './admin-whatsapp.service';
import { AtualizarWhatsappConfigDto } from './dto/atualizar-whatsapp-config.dto';

/** Painel de WhatsApp por condomínio (super admin): status, contadores e regras de disparo. */
@Controller('admin/whatsapp')
@Roles('superadmin')
export class AdminWhatsappController {
  constructor(private readonly service: AdminWhatsappService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Patch(':tenantId')
  atualizar(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AtualizarWhatsappConfigDto,
  ) {
    return this.service.atualizar(tenantId, dto);
  }
}
