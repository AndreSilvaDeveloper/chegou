/**
 * CEP — a mesma disciplina do telefone e do documento: a **tela** mascara, a
 * **API** recebe só dígitos.
 *
 * Espelha `src/common/cep.ts` no backend. Lá é quem recusa; aqui é só para o
 * usuário não descobrir o erro depois de salvar.
 */

export function apenasDigitosCep(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 8);
}

/**
 * Mascara **enquanto se digita**: `36010` → `36010`, `360100` → `36010-0`.
 *
 * O hífen só aparece a partir do sexto dígito, e não antes: campo que já mostra
 * o separador com a caixa vazia parece um formato exigido, e o usuário tenta
 * digitá-lo.
 */
export function mascaraCep(digitos: string): string {
  const d = apenasDigitosCep(digitos);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

/** Para listagem e leitura: já vem sem máscara da API. */
export function formatarCep(cep: string | null | undefined): string {
  if (!cep) return '';
  return mascaraCep(cep);
}

/** Completo o bastante para valer uma consulta? */
export function cepCompleto(digitos: string): boolean {
  return apenasDigitosCep(digitos).length === 8;
}
