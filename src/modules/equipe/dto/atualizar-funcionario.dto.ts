import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class AtualizarFuncionarioDto {
  @IsString()
  @IsOptional()
  nome?: string;

  @IsString()
  @IsOptional()
  cargo?: string;

  @IsString()
  @IsOptional()
  telefone?: string | null;

  @IsString()
  @IsOptional()
  documento?: string | null;

  @IsEmail()
  @IsOptional()
  email?: string | null;

  @IsDateString()
  @IsOptional()
  dataAdmissao?: string | null;

  @IsString()
  @IsOptional()
  horarioTrabalho?: string | null;

  @IsString()
  @IsOptional()
  observacoes?: string | null;

  @IsUUID()
  @IsOptional()
  userId?: string | null;

  @IsBoolean()
  @IsOptional()
  ativo?: boolean;
}
