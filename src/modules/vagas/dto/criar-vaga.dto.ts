import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TipoVaga } from '../../../database/entities/vaga.entity';

export class CriarVagaDto {
  @IsString()
  @IsNotEmpty()
  numero!: string;

  @IsEnum(TipoVaga)
  @IsNotEmpty()
  tipo!: TipoVaga;

  @IsString()
  @IsOptional()
  localizacao?: string;

  @IsUUID()
  @IsOptional()
  apartamentoId?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;
}
