import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Gabarito de uma amostra: o que a etiqueta REALMENTE diz, digitado pelo
 * superadmin. Mesma forma do que o parser extrai — é o que permite comparar
 * campo a campo.
 *
 * Todo campo é opcional e aceita vazio: etiqueta sem bloco é comum, e "não tem
 * bloco" é uma informação legítima (o parser acerta ao não inventar um).
 */
export class CamposEtiquetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  destinatario?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  andar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  transportadora?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codigoRastreio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cep?: string | null;
}

export class AtualizarAmostraDto {
  /** Enviar o gabarito é o que marca a amostra como conferida. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CamposEtiquetaDto)
  gabarito?: CamposEtiquetaDto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  transportadora?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string | null;
}
