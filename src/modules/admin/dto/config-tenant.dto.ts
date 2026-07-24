import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

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

  /**
   * Template da mensagem de encomenda (com variáveis {{...}}).
   * Vazio = usa o template padrão do sistema.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  whatsappTemplateEncomenda?: string;
}

export const DEFAULT_TENANT_CONFIG: Required<ConfigTenantDto> = {
  tipo: 'residencial',
  estruturaBlocos: 'unico',
  moduloVagas: false,
  moduloAvisos: false,
  horarioEnvioInicio: '08:00',
  horarioEnvioFim: '21:00',
  whatsappIntervaloSegundos: 60,
  whatsappJitterSegundos: 60,
  whatsappLimiteDiario: 100,
  whatsappTemplateEncomenda: '',
};
