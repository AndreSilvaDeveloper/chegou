import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Roles, TenantId, CurrentUser } from '../../common/decorators';
import { AvisosService } from './avisos.service';
import { CriarAvisoDto } from './dto/criar-aviso.dto';

@Controller('avisos')
export class AvisosController {
  constructor(private readonly service: AvisosService) {}

  @Get()
  @Roles('admin', 'sindico', 'porteiro')
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'sindico', 'porteiro')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(
    @TenantId() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CriarAvisoDto,
  ) {
    return this.service.criar(tenantId, userId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'sindico')
  @HttpCode(200)
  desativar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.desativar(tenantId, id);
  }
}
