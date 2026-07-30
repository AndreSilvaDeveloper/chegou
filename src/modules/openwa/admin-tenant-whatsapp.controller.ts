import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators';
import { AtualizarConfigWhatsappPlataformaDto } from './dto/atualizar-config-plataforma.dto';
import { ConnectionInfo, OpenwaService, QrInfo, WhatsappTenantConfig } from './openwa.service';

/**
 * O WhatsApp de **um** condomínio, operado pela plataforma.
 *
 * Espelha `/whatsapp/config` e `/whatsapp/connection` com o condomínio no path.
 * Existe por dois motivos:
 *
 * 1. **Suporte.** O QR e o "desconectar" eram só do síndico; quando o número
 *    caía, a plataforma não tinha como reconectar sem pedir a senha do cliente.
 * 2. É o mesmo padrão de `admin/tenants/:tenantId/...` já usado para usuários,
 *    apartamentos e moradores — o front reaproveita os mesmos cards trocando só
 *    o `basePath`.
 *
 * O condomínio **nunca** vem de `X-Tenant-Id` aqui: vem da URL, que é o que
 * permite o superadmin abrir a tela de um condomínio sem "entrar" nele.
 */
@Controller('admin/tenants/:tenantId/whatsapp')
@Roles('superadmin')
export class AdminTenantWhatsappController {
  constructor(private readonly service: OpenwaService) {}

  // ----------------------------------------------------------------- config

  /** Ritmo de envio e modelos, com as faixas **da plataforma** (sem as travas do síndico). */
  @Get('config')
  obterConfig(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<WhatsappTenantConfig> {
    return this.service.getWhatsappConfig(tenantId, 'plataforma');
  }

  @Patch('config')
  atualizarConfig(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AtualizarConfigWhatsappPlataformaDto,
  ): Promise<WhatsappTenantConfig> {
    return this.service.updateWhatsappConfigPlataforma(tenantId, dto);
  }

  // --------------------------------------------------------------- conexão

  /** Status da sessão (provisiona a instância de forma preguiçosa, se faltar). */
  @Get('connection')
  status(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<ConnectionInfo> {
    return this.service.getConnection(tenantId);
  }

  @Post('connection/connect')
  connect(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<ConnectionInfo> {
    return this.service.connect(tenantId);
  }

  @Get('connection/qr')
  qr(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<QrInfo> {
    return this.service.getQr(tenantId);
  }

  @Post('connection/restart')
  restart(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<ConnectionInfo> {
    return this.service.restart(tenantId);
  }

  @Post('connection/disconnect')
  disconnect(@Param('tenantId', ParseUUIDPipe) tenantId: string): Promise<ConnectionInfo> {
    return this.service.disconnect(tenantId);
  }

  // ---------------------------------------------------------- instância

  /**
   * Cria (ou adota) a instância do condomínio no gateway.
   *
   * O `getConnection` já provisiona sozinho quando falta; este continua
   * existindo porque, diferente dele, **propaga o erro** do gateway — é o que
   * transforma "não conecta" em uma mensagem que diz o motivo.
   */
  @Post('provision')
  provisionar(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.provision(tenantId);
  }
}
