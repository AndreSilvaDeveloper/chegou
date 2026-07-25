import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';

export class AtualizarFuncionarioDto {
  @IsString()
  @IsOptional()
  nome?: string;

  @IsString()
  @IsOptional()
  cargo?: string;

  // `null` limpa o campo; texto passa pela normalização de telefone.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @TelefoneE164()
  telefone?: string | null;

  @IsString()
  @IsOptional()
  documento?: string | null;

  @IsEmail()
  @IsOptional()
  email?: string | null;

  @IsDateString()
  @IsOptional()
  dataAdmissao?: string | null;

  @IsString()
  @IsOptional()
  horarioTrabalho?: string | null;

  @IsString()
  @IsOptional()
  observacoes?: string | null;

  @IsUUID()
  @IsOptional()
  userId?: string | null;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
