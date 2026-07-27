import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Uma linha da tabela de preços. */
export class FaixaDto {
  /** Limite superior da faixa, inclusive. Ausente = última faixa, sem teto. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  ateQuantidade?: number | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  precoApartamento!: number;
}

/**
 * Substitui a tabela de preços inteira.
 *
 * É lista completa, não incremental: mandar duas faixas apaga a terceira. A
 * ordem do array **é** a ordem das faixas — quem valida a coerência (tetos
 * crescentes, última sem teto) é o service.
 */
export class DefinirFaixasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FaixaDto)
  faixas!: FaixaDto[];
}
