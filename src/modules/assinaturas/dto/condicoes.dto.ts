import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ModoAssinatura } from '../../../database/entities/assinatura-condicao.entity';

/** Data no formato `AAAA-MM-DD` — o mesmo texto que o banco guarda. */
const DATA_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * O preço negociado com **um** cliente: condomínio ou administradora, nunca os
 * dois. Criar uma condição encerra a que estava em aberto — o histórico é o que
 * explica por que a fatura de março saiu diferente da de abril.
 */
export class CriarCondicaoDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  administradoraId?: string;

  @IsIn(Object.values(ModoAssinatura))
  modo!: ModoAssinatura;

  /** Obrigatório no modo `preco_apartamento`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000)
  precoApartamento?: number;

  /** Obrigatório no modo `valor_fixo`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  valorFixo?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  descontoPercentual?: number;

  /** Padrão: hoje. */
  @IsOptional()
  @Matches(DATA_REGEX, { message: 'Início da vigência deve estar no formato AAAA-MM-DD' })
  vigenteDe?: string;

  /** Por que este cliente paga diferente. Daqui a um ano ninguém lembra. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class EncerrarCondicaoDto {
  /** Último dia em que a condição vale. Padrão: hoje. */
  @IsOptional()
  @Matches(DATA_REGEX, { message: 'Fim da vigência deve estar no formato AAAA-MM-DD' })
  vigenteAte?: string;
}

export class QueryCondicoesDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  administradoraId?: string;
}
