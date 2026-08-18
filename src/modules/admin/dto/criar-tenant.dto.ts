import { DocumentoBrasileiro } from '../../../common/documento';
import { Cep } from '../../../common/cep';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';
import { ConfigInicialCondominioDto } from './config-inicial-condominio.dto';

/**
 * O cadastro de um condomínio novo, em três passos na tela.
 *
 * **Por que este DTO não estende `EnderecoDto`.** Lá todo campo é `@IsOptional()`
 * — endereço é preenchimento incremental na *edição*. Só que o `@IsOptional()` é
 * herdado pela subclasse e **desliga** qualquer obrigatoriedade que ela tente
 * declarar por cima: o `class-validator` pula o campo inteiro quando ele vem
 * nulo, então um `@IsNotEmpty()` no filho nunca rodaria. Na criação os campos
 * são obrigatórios, e a única forma de isso ser verdade é declará-los aqui.
 * Manter os dois em dia é o preço; a alternativa era uma obrigatoriedade que
 * silenciosamente não valia.
 */
export class CriarTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nome!: string;

  /**
   * **Opcional, e a tela nem mostra.** Vazio = o servidor gera a partir do nome
   * e garante a unicidade (ver `AdminService.slugUnico`). Continua aceito no
   * corpo para quem precisar forçar um slug específico — migração de dado, por
   * exemplo —, mas nenhuma tela manda.
   */
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,80}$/, {
    message: 'Slug deve ter 3-80 caracteres: letras minúsculas, números, hífen',
  })
  slug?: string;

  @DocumentoBrasileiro()
  @IsNotEmpty({ message: 'Informe o CNPJ ou CPF do condomínio' })
  documento!: string;

  /** É por aqui que o gateway manda o link de pagamento da assinatura. */
  @IsEmail({}, { message: 'E-mail de contato inválido' })
  emailContato!: string;

  @TelefoneE164()
  @IsNotEmpty({ message: 'Informe o telefone de contato do condomínio' })
  telefoneContato!: string;

  // ---- Endereço (passo 2) ----
  // Obrigatório na criação: é o endereço que vai para o cadastro de cobrança, e
  // condomínio criado sem ele vira pendência que só aparece quando a fatura não
  // sai. Complemento e bairro seguem livres — nem todo endereço tem os dois.

  @Cep()
  @IsNotEmpty({ message: 'Informe o CEP' })
  cep!: string;

  /** Logradouro (rua/avenida), sem número — ver `EnderecoDto`. */
  @IsString()
  @IsNotEmpty({ message: 'Informe o logradouro' })
  @MaxLength(500)
  endereco!: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe o número' })
  @MaxLength(20)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a cidade' })
  @MaxLength(120)
  cidade!: string;

  @Matches(/^[A-Z]{2}$/, { message: 'UF deve ter 2 letras maiúsculas' })
  estado!: string;

  // ---- Primeiro síndico (passo 3) ----
  // Condomínio sem ninguém para entrar não serve para nada, então ele nasce
  // junto, na mesma transação.

  @IsString()
  @IsNotEmpty()
  sindicoNome!: string;

  @IsEmail({}, { message: 'E-mail do síndico inválido' })
  sindicoEmail!: string;

  @IsString()
  @MinLength(6)
  sindicoSenha!: string;

  @TelefoneE164()
  @IsNotEmpty({ message: 'Informe o telefone do síndico' })
  sindicoTelefone!: string;

  // ---- Configurações (passo 4) ----
  /**
   * Opcional: sem ele o condomínio nasce com `DEFAULT_TENANT_CONFIG`, como
   * sempre nasceu. O que vier aqui é **mesclado** por cima dos padrões, e nunca
   * substitui o objeto inteiro — é o que garante que os campos que o passo 4
   * não pergunta (ritmo de disparo, cota diária, `moduloAvisos`) continuem
   * saindo do padrão em vez de nascerem indefinidos.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigInicialCondominioDto)
  configJson?: ConfigInicialCondominioDto;
}
