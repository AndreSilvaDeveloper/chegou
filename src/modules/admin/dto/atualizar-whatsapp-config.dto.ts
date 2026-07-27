import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Atualização das regras de disparo WhatsApp de um condomínio (super admin). */
export class AtualizarWhatsappConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  intervaloSegundos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  jitterSegundos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  limiteDiario?: number;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioInicio?: string;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioFim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  templateEncomenda?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  templateRetirada?: string;
}
