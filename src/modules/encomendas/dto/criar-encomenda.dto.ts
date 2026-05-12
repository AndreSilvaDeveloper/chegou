import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CriarEncomendaDto {
  @IsUUID()
  apartamentoId!: string;

  @IsOptional()
  @IsUUID()
  moradorDestinoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  transportadora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codigoRastreio?: string;

  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
