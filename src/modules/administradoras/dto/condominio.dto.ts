import { DocumentoBrasileiro } from '../../../common/documento';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O que a administradora pode configurar num condomínio da carteira.
 *
 * **Só o operacional**: como o condomínio funciona. Módulos contratados
 * (`moduloVagas`, `moduloAvisos`) ficam de fora de propósito — são decisão
 * comercial da plataforma, e o `forbidNonWhitelisted` do `ValidationPipe`
 * transforma essa ausência em 400 se alguém tentar mandá-los pela rota.
 *
 * Os modelos de mensagem e o ritmo de envio também não estão aqui: eles têm
 * tela própria (`/whatsapp`), com as faixas anti-bloqueio.
 */
export class ConfigOperacionalCondominioDto {
  @IsOptional()
  @IsIn(['residencial', 'comercial', 'misto'])
  tipo?: 'residencial' | 'comercial' | 'misto';

  @IsOptional()
  @IsIn(['unico', 'multiplos'])
  estruturaBlocos?: 'unico' | 'multiplos';

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioInicio?: string;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioFim?: string;
}

/**
 * Campos do condomínio que a administradora pode editar.
 *
 * De fora ficam `plano`, `ativo`, `slug`, módulos contratados e a própria
 * carteira: são decisões da plataforma, então continuam só no superadmin.
 *
 * `ativo` merece o destaque: condomínio inativo sai da conta da assinatura
 * (ela conta apartamento ativo **de condomínio ativo**), então esse botão na
 * mão de quem paga a fatura seria um jeito de baixar a própria conta.
 */
export class AtualizarCondominioDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @DocumentoBrasileiro()
  documento?: string;

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
  @TelefoneE164()
  telefoneContato?: string;

  @IsOptional()
  @IsEmail()
  emailContato?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfigOperacionalCondominioDto)
  configJson?: ConfigOperacionalCondominioDto;
}
