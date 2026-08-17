import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { DocumentoBrasileiro } from '../../../common/documento';
import { EnderecoDto } from '../../../common/endereco.dto';
import { TelefoneE164 } from '../../../common/telefone';

/**
 * O que o síndico pode configurar no próprio condomínio.
 *
 * **Só o que descreve o condomínio.** Módulos contratados (`moduloVagas`,
 * `moduloAvisos`) ficam de fora por serem decisão comercial da plataforma, e o
 * `forbidNonWhitelisted` do `ValidationPipe` transforma essa ausência em 400 se
 * alguém tentar mandá-los por aqui.
 *
 * **A janela de envio também fica de fora, e isso é de propósito.** Ela já é
 * editada em `/whatsapp`, onde a tela aplica as travas anti-bloqueio (faixa
 * 08:00–21:00) e mostra quantas mensagens cabem no dia. Aceitá-la aqui daria
 * dois editores para o mesmo campo — e este seria o sem trava visual. Um campo,
 * uma tela.
 */
export class ConfigMeuCondominioDto {
  @IsOptional()
  @IsIn(['residencial', 'comercial', 'misto'])
  tipo?: 'residencial' | 'comercial' | 'misto';

  @IsOptional()
  @IsIn(['unico', 'multiplos'])
  estruturaBlocos?: 'unico' | 'multiplos';
}

/**
 * Campos do condomínio que o síndico pode editar.
 *
 * De fora ficam `plano`, `ativo`, `slug`, os módulos contratados e a carteira —
 * exatamente os mesmos que a administradora não edita, pelos mesmos motivos:
 *
 * - **`ativo`** desliga o acesso de todo mundo do condomínio, inclusive o do
 *   próprio síndico, e tira o condomínio da conta da assinatura (ela conta
 *   apartamento ativo **de condomínio ativo**).
 * - **`slug`** é o nome da sessão do condomínio no gateway de WhatsApp
 *   (`{OPENWA_SESSION_PREFIX}-{slug}`). Trocá-lo é trocar de sessão.
 * - **`plano`** é contrato, não operação.
 *
 * O endereço completo (CEP, logradouro, número, complemento, bairro, cidade e
 * UF) vem de `EnderecoDto` — os mesmos campos que a administradora e o
 * superadmin editam, para o cadastro não depender de por qual das três telas ele
 * foi preenchido.
 */
export class AtualizarMeuCondominioDto extends EnderecoDto {
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
  @Type(() => ConfigMeuCondominioDto)
  configJson?: ConfigMeuCondominioDto;
}
