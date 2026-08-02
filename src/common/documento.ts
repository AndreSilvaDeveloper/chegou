import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Validate, ValidationOptions, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

/**
 * O documento do cliente: **CPF ou CNPJ**, só dígitos.
 *
 * Aceita os dois porque nem todo condomínio tem CNPJ — muitos são administrados
 * pelo síndico em nome próprio. Como o documento é obrigatório para existir no
 * gateway de pagamento, exigir CNPJ deixaria esses clientes sem cobrança
 * possível.
 *
 * Guardamos **sem formatação**, como o telefone guarda E.164: a máscara é da
 * tela, o banco tem o dado.
 */

/** Tira máscara e espaços. Vazio vira `null` (campo é opcional). */
export function normalizarDocumento(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  if (valor === undefined) return undefined;
  // Tipo errado passa direto: quem recusa é a validação, com mensagem de campo.
  if (typeof valor !== 'string') return valor as string;

  const digitos = valor.replace(/\D/g, '');
  return digitos || null;
}

/**
 * CPF pelos dois dígitos verificadores.
 *
 * Conferir só o tamanho deixaria passar `00000000000` e qualquer sequência
 * digitada de qualquer jeito — que é exatamente o que o gateway recusa depois,
 * quando já não dá para explicar ao usuário onde ele errou.
 */
export function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  // Todos os dígitos iguais passam na conta dos verificadores, mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/** CNPJ pelos dois dígitos verificadores (pesos 2..9, cíclicos). */
export function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    let peso = 2;
    for (let i = ate - 1; i >= 0; i--) {
      soma += Number(cnpj[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

/** É um CPF ou um CNPJ válido? (já sem máscara) */
export function documentoValido(documento: string): boolean {
  return cpfValido(documento) || cnpjValido(documento);
}

/** Mascara para exibição: `123.456.789-01` ou `12.345.678/0001-90`. */
export function formatarDocumento(documento: string | null | undefined): string {
  if (!documento) return '';
  if (documento.length === 11) {
    return documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (documento.length === 14) {
    return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return documento;
}

@ValidatorConstraint({ name: 'documentoBrasileiro', async: false })
class DocumentoBrasileiroConstraint implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    // `null`/ausente é tratado pelo `@IsOptional` de quem usa o decorator.
    if (valor === null || valor === undefined) return true;
    return typeof valor === 'string' && documentoValido(valor);
  }

  defaultMessage(): string {
    return 'Documento inválido. Informe um CPF ou CNPJ';
  }
}

/**
 * Campo de documento da API: tira a máscara e confere os dígitos.
 *
 * Use em **todo** campo de CPF/CNPJ, junto de `@IsOptional()` quando o campo
 * puder ficar vazio — é o que mantém um único formato no banco e permite que a
 * tela mande o documento mascarado.
 */
export function DocumentoBrasileiro(options?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizarDocumento(value)),
    Validate(DocumentoBrasileiroConstraint, options),
  );
}
