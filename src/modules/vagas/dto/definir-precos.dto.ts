import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { TipoVaga } from '../../../database/entities/vaga.entity';

export class PrecoVagaDto {
  @IsEnum(TipoVaga)
  tipo!: TipoVaga;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  valorMensal!: number;
}

/** Substitui a tabela de preços do condomínio pela lista enviada. */
export class DefinirPrecosDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PrecoVagaDto)
  precos!: PrecoVagaDto[];
}
