import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { VagasDoApartamentoDto } from './vagas-do-apartamento.dto';

export class CriarApartamentoDto {
  /**
   * Obrigatório ou proibido conforme a estrutura do condomínio
   * (`config_json.estruturaBlocos`) — quem decide é o service, não este DTO,
   * porque a regra depende do condomínio da request.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloco?: string;

  @IsString()
  @MaxLength(20)
  numero!: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  /**
   * Vagas de garagem da unidade, cadastradas junto. Exige o módulo Vagas
   * habilitado e perfil que gerencia vagas (síndico ou administradora).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => VagasDoApartamentoDto)
  vagas?: VagasDoApartamentoDto;
}
