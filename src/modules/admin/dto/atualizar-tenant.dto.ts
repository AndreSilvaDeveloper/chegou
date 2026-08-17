import { DocumentoBrasileiro } from '../../../common/documento';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TelefoneE164 } from '../../../common/telefone';
import { EnderecoDto } from '../../../common/endereco.dto';
import { ConfigTenantDto } from './config-tenant.dto';

/**
 * O endereço vem de `EnderecoDto`, e é o que faz esta rota deixar de ser a mais
 * pobre das três: até aqui o superadmin só editava cidade e UF, então quando a
 * cobrança falhava por endereço incompleto quem tinha de consertar era o próprio
 * cliente — justamente quem abriu o chamado.
 */
export class AtualizarTenantDto extends EnderecoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Matches(/^[a-z0-9-]{3,80}$/, { message: 'Slug deve ter 3-80 caracteres: letras minúsculas, números, hífen' })
  slug?: string;

  @IsOptional()
  @DocumentoBrasileiro()
  documento?: string;

  // Contatos do condomínio. Entraram junto com o wizard de criação: o
  // superadmin passou a EXIGI-LOS no cadastro e não tinha onde corrigi-los
  // depois — um e-mail digitado errado ali deixaria a cobrança sem destino, e o
  // conserto seria pelo banco.
  @IsOptional()
  @IsEmail({}, { message: 'E-mail de contato inválido' })
  emailContato?: string;

  @IsOptional()
  @TelefoneE164()
  telefoneContato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plano?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigTenantDto)
  configJson?: ConfigTenantDto;
}
