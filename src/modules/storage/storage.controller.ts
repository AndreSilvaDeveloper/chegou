import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, TenantId } from '../../common/decorators';
import { StorageService } from './storage.service';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

@Controller('uploads')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('encomenda-foto')
  @Roles('porteiro', 'admin', 'sindico')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async uploadEncomendaFoto(
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório no campo "file"');
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(`Tipo não suportado: ${file.mimetype}`);
    }
    return this.storage.uploadEncomendaFoto(tenantId, file);
  }
}
