/**
 * CPF ou CNPJ do cliente — a mesma disciplina do telefone: a **tela** mascara,
 * a **API** recebe só dígitos.
 *
 * Aceita os dois porque nem todo condomínio tem CNPJ; muitos são administrados
 * pelo síndico em nome próprio, e o documento é obrigatório para o cliente
 * existir no gateway de pagamento. Espelha `src/common/documento.ts` no backend
 * — lá é ele que recusa; aqui é só para o usuário não descobrir o erro depois
 * de salvar.
 */

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Mascara conforme o tamanho, **enquanto se digita**.
 *
 * A máscara cresce com o que já foi digitado em vez de esperar o documento
 * ficar completo: campo que só se formata no fim pisca de um jeito estranho a
 * cada tecla. Até 11 dígitos desenha como CPF, daí em diante como CNPJ — é a
 * única leitura possível, já que os dois começam iguais.
 */
export function mascaraDocumento(digitos: string): string {
  const d = digitos.slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

/** Para listagem e leitura: já vem sem máscara da API. */
export function formatarDocumento(documento: string | null | undefined): string {
  if (!documento) return '';
  return mascaraDocumento(documento);
}

/** Rótulo do que foi digitado, para a tela dizer o que está lendo. */
export function tipoDocumento(digitos: string): 'CPF' | 'CNPJ' | null {
  if (digitos.length === 11) return 'CPF';
  if (digitos.length === 14) return 'CNPJ';
  return null;
}

/**
 * Documento completo o bastante para valer a pena mandar?
 *
 * Só o tamanho — **os dígitos verificadores quem confere é o backend**. Repetir
 * a conta aqui criaria duas fontes da verdade para a mesma regra, e a que
 * importa é a que recusa o cadastro.
 */
export function documentoCompleto(digitos: string): boolean {
  return digitos.length === 11 || digitos.length === 14;
}
