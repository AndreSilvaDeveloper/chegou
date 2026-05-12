import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AtualizarApartamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
