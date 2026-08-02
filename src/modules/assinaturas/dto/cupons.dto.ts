import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { TipoCliente } from '../assinatura-clientes.service';

/** Criação de cupom — o corpo vai direto para a Payment API. */
export class CriarCupomDto {
  /**
   * O padrão é o deles (`^[A-Z0-9_-]+$`), conferido aqui para o usuário ver o
   * erro no campo em vez de um 400 genérico vindo do gateway.
   */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'código só aceita letras, números, hífen e sublinhado',
  })
  @MaxLength(60)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  discountType!: 'PERCENTAGE' | 'FIXED_AMOUNT';

  /**
   * **`PERCENTAGE` é limitado a 90** do lado deles.
   *
   * Não é um limite que dê para contornar: cortesia total não é cupom, é
   * condição com `valor_fixo = 0` — e aí a regra "fatura de R$ 0,00 não nasce"
   * resolve sozinha.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  discountValue!: number;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  /** Limite global de usos. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  /**
   * Usos por cliente.
   *
   * É **este** campo que faz "20% nos 3 primeiros meses": cada fatura é uma
   * cobrança, então `maxUsesPerCustomer: 3` são três meses de desconto.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerCustomer?: number;
}

/** Atribuir um cupom a um cliente. */
export class AtribuirCupomDto {
  @IsIn(['condominio', 'administradora'])
  tipo!: TipoCliente;

  @IsUUID()
  clienteId!: string;

  @IsString()
  @MaxLength(60)
  codigo!: string;

  /**
   * Última competência em que o cupom é aplicado (`YYYY-MM`).
   *
   * Vazio = enquanto ele valer no gateway. É o freio do nosso lado.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'aplicarAte deve estar no formato YYYY-MM' })
  aplicarAte?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}
