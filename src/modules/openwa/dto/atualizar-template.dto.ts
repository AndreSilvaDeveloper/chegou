import { IsString, MaxLength } from 'class-validator';

/** Atualização do template de encomenda pelo próprio condomínio (síndico/admin). */
export class AtualizarTemplateDto {
  /** Template com variáveis {{...}}. Vazio = usa o padrão do sistema. */
  @IsString()
  @MaxLength(2000)
  templateEncomenda!: string;
}
