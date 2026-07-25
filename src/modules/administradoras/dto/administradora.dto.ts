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

export class CriarAdministradoraDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
  telefoneContato?: string;
}

export class AtualizarAdministradoraDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
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
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
  telefone?: string;
}

/** Move um condomínio existente para a carteira (uso do superadmin). */
export class VincularCondominioDto {
  @IsUUID()
  tenantId!: string;
}
