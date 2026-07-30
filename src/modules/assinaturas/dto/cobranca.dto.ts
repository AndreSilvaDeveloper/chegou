import { IsInt, Max, Min, ValidateIf } from 'class-validator';

/**
 * O dia de vencimento negociado com um condomínio.
 *
 * `null` é um valor **legítimo** aqui — é como o superadmin devolve o
 * condomínio ao padrão da plataforma. Por isso o campo é obrigatório e o
 * `ValidateIf` libera só o `null`: omitir o campo por engano não pode limpar em
 * silêncio um combinado com o cliente.
 */
export class DefinirDiaVencimentoDto {
  @ValidateIf((o) => o.diaVencimento !== null)
  @IsInt({ message: 'Informe o dia do vencimento, ou null para usar o padrão da plataforma' })
  @Min(1)
  @Max(31, { message: 'O dia precisa estar entre 1 e 31' })
  diaVencimento!: number | null;
}
