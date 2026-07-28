import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TelefoneE164 } from '../../../common/telefone';

/**
 * Dados que o próprio morador preenche na página pública de autocadastro.
 *
 * Superfície deliberadamente menor que a do `CriarMoradorDto`: `principal` e
 * `receberWhatsapp` são decisão da gestão, não do morador — quem se cadastra por
 * aqui entra como não-principal e recebendo WhatsApp (o produto inteiro depende
 * disso). O `apartamentoId` é validado contra o condomínio do token no service.
 */
export class AutocadastroMoradorDto {
  @IsUUID()
  apartamentoId!: string;

  // Trim antes do IsNotEmpty: "   " passaria como preenchido e viraria morador
  // sem nome na listagem.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Informe o seu nome' })
  @MaxLength(200)
  nome!: string;

  /** Obrigatório: é por onde o morador é avisado. Aceita `(32) 99999-9999`. */
  @TelefoneE164()
  telefoneE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
