import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { TipoAviso, DestinatarioAviso } from '../../../database/entities/aviso.entity';

export class CriarAvisoDto {
  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  conteudo!: string;

  @IsEnum(TipoAviso)
  @IsOptional()
  tipo?: TipoAviso;

  @IsEnum(DestinatarioAviso)
  @IsOptional()
  destinatario?: DestinatarioAviso;

  @IsObject()
  @IsOptional()
  destinatarioFiltro?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  enviarWhatsapp?: boolean;
}
