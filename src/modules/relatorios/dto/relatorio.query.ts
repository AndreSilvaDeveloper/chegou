import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class RelatorioQuery {
  /** Data inicial (YYYY-MM-DD, fuso do condomínio). Padrão: 29 dias antes de `ate`. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Data final inclusiva (YYYY-MM-DD, fuso do condomínio). Padrão: hoje. */
  @IsOptional()
  @IsDateString()
  ate?: string;

  /** Filtra por bloco do apartamento. Vazio = todos os blocos. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloco?: string;
}
