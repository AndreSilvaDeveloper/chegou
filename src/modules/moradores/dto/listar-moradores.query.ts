import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListarMoradoresQuery {
  @IsOptional()
  @IsUUID()
  apartamentoId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
