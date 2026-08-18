import { DocumentoBrasileiro } from '../../../common/documento';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EnderecoDto } from '../../../common/endereco.dto';
import { TelefoneE164 } from '../../../common/telefone';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * O que a administradora pode configurar num condomínio da carteira.
 *
 * **Só o operacional**: como o condomínio funciona. `plano`, `ativo` e `slug`
 * continuam de fora — descrevem o *contrato*, não o condomínio —, e o
 * `forbidNonWhitelisted` do `ValidationPipe` transforma essa ausência em 400.
 *
 * **Vagas e Avisos ficam AQUI, e essa decisão mudou.** Eles já foram tratados
 * como "módulo contratado", portanto exclusivos do superadmin. Na prática a
 * administradora é quem implanta o condomínio e quem sabe se ele tem garagem
 * para administrar ou mural para publicar — e cada implantação virava um
 * chamado para ligar um interruptor. Ligá-los **não muda o que ela paga**: a
 * assinatura é por apartamento ativo, não por módulo (ver
 * `calcularAssinatura`), então aqui não há preço a proteger. `plano` e `ativo`
 * são o oposto: mexem na conta, e por isso continuam fora.
 *
 * Os modelos de mensagem e o ritmo de envio não estão aqui: eles têm tela
 * própria (`/whatsapp`), com as faixas anti-bloqueio.
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

  @IsOptional()
  @IsBoolean()
  moduloVagas?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloAvisos?: boolean;
}

/**
 * Campos do condomínio que a administradora pode editar.
 *
 * De fora ficam `plano`, `ativo`, `slug` e a própria carteira: são decisões da
 * plataforma, então continuam só no superadmin.
 *
 * `ativo` merece o destaque: condomínio inativo sai da conta da assinatura
 * (ela conta apartamento ativo **de condomínio ativo**), então esse botão na
 * mão de quem paga a fatura seria um jeito de baixar a própria conta.
 *
 * O endereço completo (CEP, logradouro, número, complemento, bairro, cidade e
 * UF) vem de `EnderecoDto` — os mesmos campos do síndico e do superadmin.
 */
export class AtualizarCondominioDto extends EnderecoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @DocumentoBrasileiro()
  documento?: string;

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
