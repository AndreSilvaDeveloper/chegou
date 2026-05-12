import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../database/entities';
import { ROLES_GERENCIAVEIS } from './criar-usuario.dto';

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
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
  telefone?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
