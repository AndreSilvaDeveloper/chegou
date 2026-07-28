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
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators';
import { AdminEtiquetasService } from './admin-etiquetas.service';
import { AtualizarAmostraDto } from './dto/campos-etiqueta.dto';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ARQUIVOS = 20;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * Banco de amostras de etiqueta (superadmin).
 *
 * Ferramenta de calibração do parser, não funcionalidade de condomínio: aqui se
 * sobe etiqueta real, marca o gabarito e mede quanto o parser acerta. Ver
 * `src/modules/etiquetas/CLAUDE.md`.
 */
@Controller('admin/etiquetas')
@Roles('superadmin')
export class AdminEtiquetasController {
  constructor(private readonly service: AdminEtiquetasService) {}

  /** Saúde do OCR + contadores — a tela usa para explicar por que o upload falhou. */
  @Get('status')
  status() {
    return this.service.status();
  }

  @Get('placar')
  placar() {
    return this.service.placar();
  }

  /** Roda o parser atual em todas as amostras e devolve o placar novo. */
  @Post('reprocessar')
  reprocessar() {
    return this.service.reprocessar();
  }

  /**
   * Upload em lote. Processa um arquivo por vez porque o OCR roda com um worker
   * só — mandar 20 em paralelo não acelera nada e ainda arrisca estourar o
   * timeout de todos de uma vez.
   *
   * Falha de um arquivo não derruba o lote: quem subiu 20 fotos quer as 19 que
   * deram certo, e saber qual falhou.
   */
  @Post('amostras')
  @UseInterceptors(
    FilesInterceptor('files', MAX_ARQUIVOS, { limits: { fileSize: MAX_BYTES } }),
  )
  async criar(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('Envie ao menos um arquivo no campo "files"');

    const criadas = [];
    const falhas: { arquivo: string; erro: string }[] = [];

    for (const file of files) {
      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        falhas.push({ arquivo: file.originalname, erro: `Tipo não suportado: ${file.mimetype}` });
        continue;
      }
      try {
        // `null`: amostra subida pelo superadmin não pertence a condomínio nenhum.
        criadas.push(await this.service.criar(file, null));
      } catch (err) {
        falhas.push({
          arquivo: file.originalname,
          erro: err instanceof Error ? err.message : 'Falha ao processar',
        });
      }
    }

    return { criadas, falhas };
  }

  @Get('amostras')
  listar(
    @Query('transportadora') transportadora?: string,
    @Query('status') status?: 'pendente' | 'conferida',
  ) {
    return this.service.listar({ transportadora, status });
  }

  @Get('amostras/:id')
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.buscar(id);
  }

  @Patch('amostras/:id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarAmostraDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete('amostras/:id')
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remover(id);
  }
}
