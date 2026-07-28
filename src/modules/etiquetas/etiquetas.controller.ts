import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles, TenantId } from '../../common/decorators';
import { LeituraEtiquetaService } from './leitura.service';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Leitura de etiqueta na portaria.
 *
 * `porteiro` e `sindico` apenas — a administradora registra encomenda, mas a
 * leitura foi definida como ferramenta de quem está na portaria. Se um dia ela
 * precisar, é acrescentar aqui **e** liberar o botão em `NovaEncomenda.tsx`.
 */
@Controller('etiquetas')
@Roles('porteiro', 'sindico')
export class EtiquetasController {
  constructor(private readonly service: LeituraEtiquetaService) {}

  @Post('ler')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  ler(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo obrigatório no campo "file"');
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(`Tipo não suportado: ${file.mimetype}`);
    }
    return this.service.ler(tenantId, file);
  }
}
