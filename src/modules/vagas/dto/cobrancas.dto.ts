import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StatusCobranca } from '../../../database/entities/vaga-cobranca.entity';

/** Competência no formato YYYY-MM (o dia é sempre 1). */
const COMPETENCIA_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GerarCobrancasDto {
  @Matches(COMPETENCIA_REGEX, { message: 'Competência deve estar no formato AAAA-MM' })
  competencia!: string;

  /**
   * Gera só para estas locações. Vazio = todas as locações vigentes.
   */
  @IsOptional()
  @IsUUID('4', { each: true })
  locacaoIds?: string[];
}

export class QueryCobrancasDto {
  @IsOptional()
  @Matches(COMPETENCIA_REGEX, { message: 'Competência deve estar no formato AAAA-MM' })
  competencia?: string;

  @IsOptional()
  @IsIn(Object.values(StatusCobranca))
  status?: StatusCobranca;

  @IsOptional()
  @IsUUID()
  locacaoId?: string;
}

export class RegistrarPagamentoDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  valorPago?: number;

  @IsOptional()
  @IsDateString()
  pagoEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

export class CancelarCobrancaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class AtualizarCobrancaDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  valor?: number;

  @IsOptional()
  @IsDateString()
  vencimento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

/** Dia do vencimento usado quando a locação não tem um definido. */
export class DiaVencimentoDto {
  @IsInt()
  @Min(1)
  @Max(31)
  dia!: number;
}
