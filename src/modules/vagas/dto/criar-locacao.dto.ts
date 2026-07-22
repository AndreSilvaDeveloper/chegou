import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CriarLocacaoDto {
  @IsUUID()
  @IsNotEmpty()
  vagaId!: string;

  @IsUUID()
  @IsOptional()
  moradorId?: string;

  @IsNumber()
  @IsNotEmpty()
  valorMensal!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsNotEmpty()
  diaVencimento!: number;

  @IsDateString()
  @IsNotEmpty()
  dataInicio!: string;

  @IsDateString()
  @IsOptional()
  dataFim?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;
}
