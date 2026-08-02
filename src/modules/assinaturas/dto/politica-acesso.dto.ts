import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * A política de bloqueio por inadimplência.
 *
 * Todos os campos são opcionais: a tela manda só o que mudou, como no resto do
 * projeto.
 */
export class AtualizarPoliticaAcessoDto {
  /**
   * Quantas faturas vencidas até bloquear.
   *
   * Mínimo 1 (é o mínimo do lado deles também). O teto de 12 é nosso: mais que
   * um ano de faturas vencidas não é política de bloqueio, é cliente perdido —
   * e um número grande digitado por engano desligaria o bloqueio sem que
   * ninguém percebesse.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  maxFaturasVencidas?: number;

  /**
   * Dias de tolerância depois do vencimento.
   *
   * O teto de 90 existe pelo mesmo motivo do acima. O recomendado é **5**: o
   * cliente que esquece o boleto não fica sem portaria na segunda-feira de manhã.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  diasTolerancia?: number;

  /** `blockOnStandaloneCharges`. **Falso aqui = nada bloqueia**, jamais. */
  @IsOptional()
  @IsBoolean()
  bloquearAvulsas?: boolean;

  /** O que o cliente lê quando é bloqueado. Vazio volta ao padrão. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  mensagemBloqueio?: string;

  /** Quanto tempo o gateway guarda a decisão. Mínimo 1 do lado deles. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  cacheTtlMinutos?: number;
}
