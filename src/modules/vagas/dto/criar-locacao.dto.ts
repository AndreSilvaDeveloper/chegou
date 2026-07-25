import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LocatarioTipo } from '../../../database/entities/vaga-locacao.entity';

/**
 * A coerência entre `locatarioTipo` e os campos do locatário é validada no
 * service (e garantida por CHECK no banco): morador exige `moradorId`; externo
 * exige nome e ao menos um canal de contato para receber a cobrança.
 */
export class CriarLocacaoDto {
  @IsUUID()
  @IsNotEmpty()
  vagaId!: string;

  @IsEnum(LocatarioTipo)
  @IsOptional()
  locatarioTipo?: LocatarioTipo;

  // ---- Locatário morador ----
  @IsUUID()
  @IsOptional()
  moradorId?: string;

  // ---- Locatário externo ----
  @IsString()
  @MaxLength(200)
  @IsOptional()
  locatarioNome?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  locatarioDocumento?: string;

  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Telefone deve estar em formato E.164 (ex.: +5511999999999)',
  })
  @IsOptional()
  locatarioTelefoneE164?: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(200)
  @IsOptional()
  locatarioEmail?: string;

  // ---- Contrato ----
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  @IsNotEmpty()
  valorMensal!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsNotEmpty()
  diaVencimento!: number;

  @IsDateString()
  @IsNotEmpty()
  dataInicio!: string;

  @IsDateString()
  @IsOptional()
  dataFim?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  observacoes?: string;
}
