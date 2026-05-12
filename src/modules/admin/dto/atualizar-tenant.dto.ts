import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AtualizarTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Matches(/^[a-z0-9-]{3,80}$/, { message: 'Slug deve ter 3-80 caracteres: letras minúsculas, números, hífen' })
  slug?: string;

  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'UF deve ter 2 letras maiúsculas' })
  estado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plano?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
