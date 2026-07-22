import { IsEnum, IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
import { TipoVaga } from '../../../database/entities/vaga.entity';

export class AtualizarVagaDto {
  @IsString()
  @IsOptional()
  numero?: string;

  @IsEnum(TipoVaga)
  @IsOptional()
  tipo?: TipoVaga;

  @IsString()
  @IsOptional()
  localizacao?: string;

  @IsUUID()
  @IsOptional()
  apartamentoId?: string | null;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
