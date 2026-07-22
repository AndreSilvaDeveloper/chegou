import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles, TenantId } from '../../common/decorators';
import { NotificationService } from './notification.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  @Roles('admin', 'sindico')
  listar(@TenantId() tenantId: string, @Query() query: QueryNotificationsDto) {
    return this.service.listar(tenantId, query);
  }

  @Get('stats')
  @Roles('admin', 'sindico')
  obterStats(@TenantId() tenantId: string) {
    return this.service.obterStats(tenantId);
  }

  @Post(':id/cancelar')
  @Roles('admin', 'sindico')
  cancelar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancelar(tenantId, id);
  }

  @Post(':id/reenviar')
  @Roles('admin', 'sindico')
  reenviar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reenviar(tenantId, id);
  }
}
