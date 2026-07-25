import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TelefoneE164 } from '../../../common/telefone';

export class CriarFuncionarioDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsString()
  @IsNotEmpty()
  cargo!: string;

  @IsOptional()
  @TelefoneE164()
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
