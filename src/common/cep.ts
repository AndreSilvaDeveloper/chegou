import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Validate, ValidationOptions, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

/**
 * O CEP do endereço: **oito dígitos, sem máscara**.
 *
 * Mesma regra do telefone e do documento — a máscara (`36010-000`) é da tela, o
 * banco guarda o dado. É isso que permite comparar, buscar e mandar o CEP ao
 * gateway de cobrança sem cada ponta ter a sua limpeza.
 */

/** Tira máscara e espaços. Vazio vira `null` (o campo é opcional em todo lugar). */
export function normalizarCep(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  if (valor === undefined) return undefined;
  // Tipo errado passa direto: quem recusa é a validação, com mensagem de campo.
  if (typeof valor !== 'string') return valor as string;

  const digitos = valor.replace(/\D/g, '');
  return digitos || null;
}

/** Mascara para exibição: `36010-000`. */
export function formatarCep(cep: string | null | undefined): string {
  if (!cep) return '';
  return cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

@ValidatorConstraint({ name: 'cepBrasileiro', async: false })
class CepConstraint implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    // `null`/ausente é tratado pelo `@IsOptional` de quem usa o decorator.
    if (valor === null || valor === undefined) return true;
    return typeof valor === 'string' && /^\d{8}$/.test(valor);
  }

  defaultMessage(): string {
    return 'CEP inválido. Informe os 8 dígitos';
  }
}

/**
 * Campo de CEP da API: tira a máscara e confere os oito dígitos.
 *
 * Não existe dígito verificador de CEP — a faixa é atribuída pelos Correios, e a
 * única checagem possível offline é o tamanho. Quem diz se o CEP **existe** é a
 * consulta (`GET /cep/:cep`), e ela é uma conveniência de preenchimento, não uma
 * trava: endereço novo demora a entrar na base, e recusar o cadastro por isso
 * deixaria o condomínio sem se cadastrar.
 */
export function Cep(options?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizarCep(value)),
    Validate(CepConstraint, options),
  );
}
