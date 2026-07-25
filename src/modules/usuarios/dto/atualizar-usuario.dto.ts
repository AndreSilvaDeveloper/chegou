import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../database/entities';
import { ROLES_GERENCIAVEIS } from './criar-usuario.dto';
import { TelefoneE164 } from '../../../common/telefone';

export class AtualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  senha?: string;

  @IsOptional()
  @IsIn(ROLES_GERENCIAVEIS)
  role?: UserRole;

  @IsOptional()
  @TelefoneE164()
  telefone?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
