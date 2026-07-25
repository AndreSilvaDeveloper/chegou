import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Campos do condomínio que a administradora pode editar.
 *
 * De fora ficam `plano`, `ativo`, módulos contratados e a própria carteira:
 * são decisões da plataforma, então continuam só no superadmin.
 */
export class AtualizarCondominioDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

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
  @MaxLength(500)
  endereco?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Telefone inválido' })
  telefoneContato?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;
}
