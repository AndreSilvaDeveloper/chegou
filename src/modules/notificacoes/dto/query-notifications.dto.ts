import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { StatusNotificacao, TipoNotificacao } from '../../../database/entities/notificacao.entity';

export class QueryNotificationsDto {
  @IsOptional()
  @IsEnum(StatusNotificacao)
  status?: StatusNotificacao;

  @IsOptional()
  @IsEnum(TipoNotificacao)
  tipo?: TipoNotificacao;

  @IsOptional()
  @IsString()
  q?: string; // Busca por telefone ou nome

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
