import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { EncomendaStatus } from '../../../database/entities';

const STATUS_VALUES: EncomendaStatus[] = ['aguardando', 'notificado', 'retirada', 'cancelada', 'devolvida'];

export class ListarEncomendasQuery {
  @IsOptional()
  @IsEnum(STATUS_VALUES)
  status?: EncomendaStatus;

  @IsOptional()
  @IsUUID()
  apartamentoId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
