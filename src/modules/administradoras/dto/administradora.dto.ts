import { DocumentoBrasileiro } from '../../../common/documento';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';

export class CriarAdministradoraDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @DocumentoBrasileiro()
  documento?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;

  @IsOptional()
  @TelefoneE164()
  telefoneContato?: string;
}

export class AtualizarAdministradoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @DocumentoBrasileiro()
  documento?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;

  @IsOptional()
  @TelefoneE164()
  telefoneContato?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * Usuário da administradora. O papel é sempre `admin` — não é campo de entrada,
 * senão viraria caminho para criar superadmin por aqui.
 */
export class CriarUsuarioAdminDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  senha!: string;

  @IsOptional()
  @TelefoneE164()
  telefone?: string;
}

/** Move um condomínio existente para a carteira (uso do superadmin). */
export class VincularCondominioDto {
  @IsUUID()
  tenantId!: string;
}
