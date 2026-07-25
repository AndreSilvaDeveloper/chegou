import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiresModule, Roles, TenantId } from '../../common/decorators';
import { VagasLocacaoService } from './vagas-locacao.service';
import { CriarLocacaoDto } from './dto/criar-locacao.dto';
import { AtualizarLocacaoDto } from './dto/atualizar-locacao.dto';

const MAX_CONTRATO_BYTES = 10 * 1024 * 1024;
const MIMES_CONTRATO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

@Controller('vagas-locacao')
@RequiresModule('vagas')
export class VagasLocacaoController {
  constructor(private readonly service: VagasLocacaoService) {}

  @Get()
  @Roles('admin', 'sindico')
  listar(@TenantId() tenantId: string) {
    return this.service.listar(tenantId);
  }

  @Get(':id')
  @Roles('admin', 'sindico')
  obter(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(tenantId, id);
  }

  @Post()
  @Roles('admin', 'sindico')
  criar(@TenantId() tenantId: string, @Body() dto: CriarLocacaoDto) {
    return this.service.criar(tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'sindico')
  atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarLocacaoDto,
  ) {
    return this.service.atualizar(tenantId, id, dto);
  }

  @Post(':id/encerrar')
  @Roles('admin', 'sindico')
  encerrar(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.encerrar(tenantId, id);
  }

  /** Anexa o contrato assinado (PDF ou foto). Reenviar substitui o anterior. */
  @Post(':id/contrato')
  @Roles('admin', 'sindico')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CONTRATO_BYTES } }))
  anexarContrato(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório no campo "file"');
    if (!MIMES_CONTRATO.includes(file.mimetype)) {
      throw new BadRequestException(
        'Formato não suportado. Envie o contrato em PDF ou como imagem (JPG, PNG, WEBP, HEIC).',
      );
    }
    return this.service.anexarContrato(tenantId, id, file);
  }

  @Delete(':id/contrato')
  @Roles('admin', 'sindico')
  removerContrato(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removerContrato(tenantId, id);
  }
}
