import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AtualizarTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  plano?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
