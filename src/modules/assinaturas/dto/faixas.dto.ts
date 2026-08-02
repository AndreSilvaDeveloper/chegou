import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoClienteAssinatura } from '../../../database/entities/assinatura-faixa.entity';

/**
 * De qual das duas tabelas de preço se está falando.
 *
 * Vai na **query**, e não no corpo, para `GET` e `PUT` usarem a mesma forma de
 * dizer isso — no `GET` não há corpo onde escrever.
 */
export class TipoClienteQueryDto {
  @IsEnum(TipoClienteAssinatura, {
    message: 'tipo deve ser condominio ou administradora',
  })
  tipo!: TipoClienteAssinatura;
}

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
