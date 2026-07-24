import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { OpenwaService } from '../openwa/openwa.service';
import { AdminWhatsappService } from './admin-whatsapp.service';
import { AtualizarWhatsappConfigDto } from './dto/atualizar-whatsapp-config.dto';

/** Painel de WhatsApp por condomínio (super admin): status, contadores e regras de disparo. */
@Controller('admin/whatsapp')
@Roles('superadmin')
export class AdminWhatsappController {
  constructor(
    private readonly service: AdminWhatsappService,
    private readonly openwa: OpenwaService,
  ) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  /** Provisiona a instância de todos os condomínios ativos que ainda não têm. */
  @Post('provision-missing')
  provisionarPendentes() {
    return this.openwa.provisionMissing();
  }

  /** Provisiona (cria + vincula) a instância de um condomínio específico. */
  @Post(':tenantId/provision')
  provisionar(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.openwa.provision(tenantId);
  }

  @Patch(':tenantId')
  atualizar(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AtualizarWhatsappConfigDto,
  ) {
    return this.service.atualizar(tenantId, dto);
  }
}
