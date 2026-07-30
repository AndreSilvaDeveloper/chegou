import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A mesma config de WhatsApp, editada pela **plataforma** (superadmin).
 *
 * É o irmão frouxo de `AtualizarConfigWhatsappDto`: sem o piso de 60s, sem a
 * janela 08:00–21:00 e sem o teto de 300/dia, e com o `jitterSegundos` — que o
 * condomínio nem enxerga, porque é o disfarce da cadência e não uma
 * preferência.
 *
 * As travas do outro DTO existem para o síndico não colocar, sem querer, o
 * número do condomínio em risco de bloqueio. Quem edita por aqui responde pela
 * plataforma inteira e às vezes precisa sair da faixa — para atender um teste,
 * um cliente em warm-up ou um incidente.
 */
export class AtualizarConfigWhatsappPlataformaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  intervaloSegundos?: number;

  /** Aleatoriedade somada ao intervalo. Só a plataforma ajusta. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  jitterSegundos?: number;

  /** Aqui "0 = ilimitado" continua valendo. */
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
