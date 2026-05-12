import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class AtualizarMoradorDto {
  @IsOptional()
  @IsUUID()
  apartamentoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Telefone deve estar em formato E.164' })
  telefoneE164?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;

  @IsOptional()
  @IsBoolean()
  receberWhatsapp?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
