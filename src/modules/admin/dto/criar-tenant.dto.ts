import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CriarTenantDto {
  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{3,80}$/, { message: 'Slug deve ter 3-80 caracteres: letras minúsculas, números, hífen' })
  slug!: string;

  @IsOptional()
  @Matches(/^\d{14}$/)
  cnpj?: string;

  @IsOptional()
  @IsString()
  cidade?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  estado?: string;

  @IsString()
  sindicoNome!: string;

  @IsEmail()
  sindicoEmail!: string;

  @IsString()
  @MinLength(6)
  sindicoSenha!: string;
}
