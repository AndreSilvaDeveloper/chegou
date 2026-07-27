import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Piso do intervalo entre mensagens. Abaixo disso o número vira alvo de bloqueio. */
export const INTERVALO_MINIMO_SEGUNDOS = 60;

/**
 * Janela em que o condomínio pode enviar. É a regra anti-bloqueio nº 5 do
 * `CLAUDE.md` raiz: nada de mensagem de madrugada. O síndico escolhe dentro
 * dela — pode estreitar, nunca esticar.
 */
export const JANELA_MINIMA = '08:00';
export const JANELA_MAXIMA = '21:00';

/** Teto de disparos/dia que o síndico pode se dar. Acima disso, só a plataforma. */
export const LIMITE_DIARIO_MINIMO = 20;
export const LIMITE_DIARIO_MAXIMO = 300;

/**
 * Configuração de WhatsApp editável pelo **próprio condomínio** (síndico/admin).
 *
 * Todo campo é opcional: a tela manda só o que mudou, e campo ausente fica como
 * está. Os limites daqui são mais apertados que os do superadmin de propósito —
 * quem opera um condomínio não deveria conseguir, sem querer, colocar o número
 * do condomínio em risco de bloqueio.
 */
export class AtualizarConfigWhatsappDto {
  /** Mensagem de quando a encomenda chega. Vazio = padrão do sistema. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  templateEncomenda?: string;

  /** Mensagem de confirmação da retirada. Vazio = padrão do sistema. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  templateRetirada?: string;

  /** Espera fixa entre mensagens. Só pode subir a partir de 60s. */
  @IsOptional()
  @IsInt()
  @Min(INTERVALO_MINIMO_SEGUNDOS, {
    message: `O intervalo mínimo entre mensagens é de ${INTERVALO_MINIMO_SEGUNDOS} segundos`,
  })
  @Max(3600)
  intervaloSegundos?: number;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioInicio?: string;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioFim?: string;

  /** Teto de mensagens por dia. Sem "0 = ilimitado" aqui: é decisão da plataforma. */
  @IsOptional()
  @IsInt()
  @Min(LIMITE_DIARIO_MINIMO)
  @Max(LIMITE_DIARIO_MAXIMO)
  limiteDiario?: number;
}
