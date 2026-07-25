import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TelefoneE164 } from '../../../common/telefone';

export class CriarMoradorDto {
  @IsUUID()
  apartamentoId!: string;

  // O trim vem antes do IsNotEmpty: "   " passaria como preenchido e viraria um
  // morador sem nome na listagem.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do morador' })
  @MaxLength(200)
  nome!: string;

  /**
   * Obrigatório: é por onde o morador fica sabendo que a encomenda chegou.
   * Aceita `(32) 99999-9999` — a conversão para E.164 é do `@TelefoneE164`.
   */
  @TelefoneE164()
  telefoneE164!: string;

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
