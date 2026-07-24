import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

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
}

export const DEFAULT_TENANT_CONFIG: Required<ConfigTenantDto> = {
  tipo: 'residencial',
  estruturaBlocos: 'unico',
  moduloVagas: false,
  moduloAvisos: false,
  horarioEnvioInicio: '08:00',
  horarioEnvioFim: '21:00',
};
