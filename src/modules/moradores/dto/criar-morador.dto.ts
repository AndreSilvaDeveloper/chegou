import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CriarMoradorDto {
  @IsUUID()
  apartamentoId!: string;

  @IsString()
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Telefone deve estar em formato E.164 (ex: +5511999998888)' })
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
}
