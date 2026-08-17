import { IsBoolean, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const HORARIO_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Configurações operacionais do condomínio.
 * Persistidas em `tenants.config_json` (JSONB). Cada campo pode habilitar
 * comportamentos em outras telas do app (módulos, nomenclatura, envios).
 */
export class ConfigTenantDto {
  @IsOptional()
  @IsIn(['residencial', 'comercial', 'misto'])
  tipo?: 'residencial' | 'comercial' | 'misto';

  @IsOptional()
  @IsIn(['unico', 'multiplos'])
  estruturaBlocos?: 'unico' | 'multiplos';

  @IsOptional()
  @IsBoolean()
  moduloVagas?: boolean;

  @IsOptional()
  @IsBoolean()
  moduloAvisos?: boolean;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioInicio?: string;

  @IsOptional()
  @Matches(HORARIO_REGEX, { message: 'Horário deve estar no formato HH:mm' })
  horarioEnvioFim?: string;

  // ---- Disparo WhatsApp (anti-bloqueio) ----
  /** Intervalo fixo (segundos) entre mensagens do mesmo número. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  whatsappIntervaloSegundos?: number;

  /** Tempo aleatório extra (segundos) somado ao intervalo fixo entre mensagens. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  whatsappJitterSegundos?: number;

  /** Limite de disparos por dia por número (0 = sem limite). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  whatsappLimiteDiario?: number;

  // Não existe template por condomínio: os textos são as cinco versões fixas de
  // `notificacoes/message-template.ts`, sorteadas a cada envio. Ver a regra e o
  // porquê lá.
}

export const DEFAULT_TENANT_CONFIG: Required<ConfigTenantDto> = {
  tipo: 'residencial',
  estruturaBlocos: 'unico',
  moduloVagas: false,
  moduloAvisos: false,
  horarioEnvioInicio: '08:00',
  horarioEnvioFim: '21:00',
  // 90s fixos + 0–90s aleatórios = 1min30 a 3min entre mensagens do mesmo
  // número. Subiu de 60/60 para afastar mais o disparo do padrão de rajada que
  // o WhatsApp não-oficial marca como spam.
  whatsappIntervaloSegundos: 90,
  whatsappJitterSegundos: 90,
  whatsappLimiteDiario: 100,
};
