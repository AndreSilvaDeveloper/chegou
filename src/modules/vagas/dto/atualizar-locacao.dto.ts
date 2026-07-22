import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { StatusLocacao } from '../../../database/entities/vaga-locacao.entity';

export class AtualizarLocacaoDto {
  @IsUUID()
  @IsOptional()
  vagaId?: string;

  @IsUUID()
  @IsOptional()
  moradorId?: string | null;

  @IsNumber()
  @IsOptional()
  valorMensal?: number;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  diaVencimento?: number;

  @IsDateString()
  @IsOptional()
  dataInicio?: string;

  @IsDateString()
  @IsOptional()
  dataFim?: string | null;

  @IsEnum(StatusLocacao)
  @IsOptional()
  status?: StatusLocacao;

  @IsString()
  @IsOptional()
  observacoes?: string;
}
