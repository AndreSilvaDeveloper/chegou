import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StatusFatura } from '../../../database/entities/assinatura-fatura.entity';

/** Competência no formato `AAAA-MM` (o dia é sempre 1). */
const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GerarFaturasDto {
  @Matches(COMPETENCIA_REGEX, { message: 'Competência deve estar no formato AAAA-MM' })
  competencia!: string;

  /** Dia do vencimento no mês seguinte à competência. Padrão: 10. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimento?: number;
}

export class QueryFaturasDto {
  @IsOptional()
  @Matches(COMPETENCIA_REGEX, { message: 'Competência deve estar no formato AAAA-MM' })
  competencia?: string;

  @IsOptional()
  @IsIn(Object.values(StatusFatura))
  status?: StatusFatura;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  administradoraId?: string;
}

export class PagarFaturaDto {
  @IsOptional()
  @IsDateString()
  pagaEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  formaPagamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class CancelarFaturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
