import { IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';

export class RetirarEncomendaDto {
  @ValidateIf((o) => !o.documentoRetirada)
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  codigoRetirada?: string;

  @ValidateIf((o) => !o.codigoRetirada)
  @IsString()
  @Length(3, 20)
  documentoRetirada?: string;

  @IsOptional()
  @IsUUID()
  moradorRetiradaId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
