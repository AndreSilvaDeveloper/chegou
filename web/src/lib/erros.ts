import { ApiError } from '@/api/client';

/**
 * Mensagem para mostrar ao usuário quando uma request falha.
 *
 * O backend já devolve mensagens escritas em português e pensadas para quem
 * está na portaria ("Já existe a vaga G-01 neste condomínio"), então elas valem
 * mais que qualquer texto genérico — o padrão só entra quando não veio nada
 * aproveitável (queda de rede, erro não tratado).
 */
export function mensagemErro(err: unknown, padrao: string): string {
  if (err instanceof ApiError && err.message) return err.message;
  return padrao;
}
