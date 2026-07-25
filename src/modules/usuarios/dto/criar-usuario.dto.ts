import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../../../database/entities';
import { TelefoneE164 } from '../../../common/telefone';

/**
 * Papéis criáveis dentro de um condomínio.
 *
 * `admin` (administradora) e `superadmin` ficam de fora de propósito: eles não
 * pertencem a um condomínio, e o banco recusa (chk_users_escopo). Usuário de
 * administradora nasce em /admin/administradoras/:id/usuarios.
 */
export const ROLES_GERENCIAVEIS: UserRole[] = ['porteiro', 'sindico'];

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
  @TelefoneE164()
  telefone?: string;
}
