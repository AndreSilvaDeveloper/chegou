import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelarEncomendaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  motivo!: string;
}
