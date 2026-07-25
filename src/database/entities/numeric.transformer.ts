import { ValueTransformer } from 'typeorm';

/**
 * Colunas NUMERIC/DECIMAL voltam do driver `pg` como string (para não perder
 * precisão em valores grandes). Nos valores monetários do sistema isso não é um
 * risco, e devolver string faz o JSON da API sair como `"150.00"` em vez de
 * `150` — o front acabava precisando de `Number(...)` em cada uso.
 */
export const numericTransformer: ValueTransformer = {
  to: (valor: number | null) => valor,
  from: (valor: string | null) => (valor == null ? null : Number(valor)),
};
