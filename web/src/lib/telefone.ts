const DDI_BRASIL = '55';

/** Só os dígitos. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** `(32) 99999-9999` enquanto se digita, sem brigar com o cursor. */
export function mascaraTelefone(digitos: string): string {
  const d = digitos.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** Número brasileiro? (E.164 com DDI 55 e 10 ou 11 dígitos nacionais) */
export function ehTelefoneBR(e164: string | null | undefined): boolean {
  if (!e164) return false;
  const d = apenasDigitos(e164);
  return d.startsWith(DDI_BRASIL) && (d.length === 12 || d.length === 13);
}

/** E.164 → dígitos nacionais, para preencher o campo mascarado. */
export function nacionalDeE164(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = apenasDigitos(e164);
  return d.startsWith(DDI_BRASIL) ? d.slice(2) : d;
}

/**
 * O que mandar para a API a partir do que foi digitado.
 *
 * O `+55` é detalhe técnico: quem cadastra digita DDD + número. Se a pessoa
 * digitar começando com `+`, é número de fora e vai como veio.
 */
export function paraE164(digitado: string): string {
  const texto = digitado.trim();
  if (!texto) return '';
  if (texto.startsWith('+')) return `+${apenasDigitos(texto)}`;
  const d = apenasDigitos(texto);
  if (!d) return '';
  return `+${DDI_BRASIL}${d}`;
}

/**
 * Telefone para leitura: `(32) 99999-9999` no Brasil, E.164 no resto.
 *
 * Use em toda listagem — número cru com `+55` colado é difícil de conferir na
 * portaria.
 */
export function formatarTelefone(e164: string | null | undefined): string {
  if (!e164) return '—';
  if (!ehTelefoneBR(e164)) return e164;
  return mascaraTelefone(nacionalDeE164(e164));
}
