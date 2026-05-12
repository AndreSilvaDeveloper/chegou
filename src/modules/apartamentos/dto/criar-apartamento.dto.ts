import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CriarApartamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloco?: string;

  @IsString()
  @MaxLength(20)
  numero!: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
