import {
  IsDateString,
  IsEmail,
  IsEnum,
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
import { LocatarioTipo, StatusLocacao } from '../../../database/entities/vaga-locacao.entity';

/**
 * `vagaId` ficou de fora de propósito: trocar a vaga de um contrato vigente
 * burlaria a checagem de vaga livre. Para mudar de vaga, encerra-se a locação e
 * cria-se outra.
 */
export class AtualizarLocacaoDto {
  @IsEnum(LocatarioTipo)
  @IsOptional()
  locatarioTipo?: LocatarioTipo;

  @IsUUID()
  @IsOptional()
  moradorId?: string | null;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  locatarioNome?: string | null;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  locatarioDocumento?: string | null;

  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Telefone deve estar em formato E.164 (ex.: +5511999999999)',
  })
  @IsOptional()
  locatarioTelefoneE164?: string | null;

  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(200)
  @IsOptional()
  locatarioEmail?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  valorMensal?: number;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  diaVencimento?: number;

  @IsDateString()
  @IsOptional()
  dataInicio?: string;

  @IsDateString()
  @IsOptional()
  dataFim?: string | null;

  @IsEnum(StatusLocacao)
  @IsOptional()
  status?: StatusLocacao;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  observacoes?: string;
}
