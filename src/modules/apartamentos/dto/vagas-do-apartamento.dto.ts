import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TipoVaga } from '../../../database/entities/vaga.entity';

/** Vaga nova, criada já pertencendo ao apartamento. */
export class NovaVagaDoApartamentoDto {
  @IsString()
  @MaxLength(20)
  numero!: string;

  @IsEnum(TipoVaga)
  tipo!: TipoVaga;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  localizacao?: string;
}

/**
 * Vagas que pertencem ao apartamento.
 *
 * Dois campos separados de propósito: "cadastrar uma vaga nova" e "vincular uma
 * que já existe" são ações diferentes na tela, e um payload polimórfico só
 * empurraria essa distinção para dentro da validação.
 */
export class VagasDoApartamentoDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => NovaVagaDoApartamentoDto)
  novasVagas?: NovaVagaDoApartamentoDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  vagasExistentesIds?: string[];
}
