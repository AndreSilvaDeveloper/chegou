import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';

export class AtualizarMoradorDto {
  @IsOptional()
  @IsUUID()
  apartamentoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  // Opcional aqui significa "não mandou o campo" — mandar vazio é recusado,
  // porque morador sem telefone não recebe aviso de encomenda.
  @IsOptional()
  @TelefoneE164()
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
