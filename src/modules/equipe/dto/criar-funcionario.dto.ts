import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CriarFuncionarioDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  cargo!: string;

  @IsString()
  @IsOptional()
  telefone?: string;

  @IsString()
  @IsOptional()
  documento?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsDateString()
  @IsOptional()
  dataAdmissao?: string;

  @IsString()
  @IsOptional()
  horarioTrabalho?: string;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
