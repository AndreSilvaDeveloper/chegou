import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../database/entities';

export const ROLES_GERENCIAVEIS: UserRole[] = ['porteiro', 'sindico', 'admin'];

export class CriarUsuarioDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  senha!: string;

  @IsIn(ROLES_GERENCIAVEIS)
  role!: UserRole;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
  telefone?: string;
}
