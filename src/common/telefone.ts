import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Matches, ValidationOptions } from 'class-validator';

/** Formato aceito pelo gateway de WhatsApp e gravado no banco. */
export const TELEFONE_E164_REGEX = /^\+[1-9]\d{1,14}$/;

const DDI_BRASIL = '55';

/**
 * Põe o telefone no formato E.164, aceitando o que o usuário costuma digitar.
 *
 * O `+55` é detalhe técnico: quem cadastra digita `(32) 99999-9999`, e é isso
 * que a tela pede. A conversão acontece aqui, na borda da API — assim todo
 * caminho de envio (WhatsApp, SMS, cobrança) continua lendo E.164 sem saber que
 * a digitação mudou, e a API segue aceitando quem já mandava E.164.
 *
 * - `(32) 99999-9999` / `32999999999` → `+5532999999999`
 * - `5532999999999` → `+5532999999999`
 * - `+351 912 345 678` → `+351912345678` (começou com `+`: respeita o país)
 * - vazio → `null`
 * - o que não dá para interpretar volta como veio, para a validação recusar com
 *   mensagem de campo em vez de estourar CHECK no banco
 */
export function normalizarTelefone(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  if (valor === undefined) return undefined;
  // Tipo errado passa direto: quem recusa é a validação, com mensagem de campo.
  if (typeof valor !== 'string') return valor as string;

  const texto = valor.trim();
  if (!texto) return null;

  // Começou com "+": é número internacional declarado, não mexemos no país.
  if (texto.startsWith('+')) {
    const digitos = texto.slice(1).replace(/\D/g, '');
    return digitos ? `+${digitos}` : texto;
  }

  const digitos = texto.replace(/\D/g, '');

  // Celular (11) ou fixo (10) com DDD.
  if (digitos.length === 10 || digitos.length === 11) return `+${DDI_BRASIL}${digitos}`;

  // Já veio com o DDI do Brasil na frente.
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith(DDI_BRASIL)) {
    return `+${digitos}`;
  }

  return texto;
}

/** Só os dígitos nacionais (sem DDI) — usado para exibir/mascarar. */
export function telefoneNacional(e164: string | null | undefined): string {
  if (!e164) return '';
  const digitos = e164.replace(/\D/g, '');
  return digitos.startsWith(DDI_BRASIL) ? digitos.slice(2) : digitos;
}

/**
 * Campo de telefone da API: normaliza o que chegou e exige E.164 depois.
 *
 * Use em **todo** campo de telefone — é o que mantém um único formato no banco
 * e permite que qualquer tela mande o número mascarado.
 */
export function TelefoneE164(options?: ValidationOptions) {
  return applyDecorators(
    Transform(({ value }) => normalizarTelefone(value)),
    Matches(TELEFONE_E164_REGEX, {
      message: 'Telefone inválido. Informe DDD + número, ex: (32) 99999-9999',
      ...options,
    }),
  );
}
