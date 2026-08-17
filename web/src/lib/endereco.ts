import { formatarCep } from '@/lib/cep';

/** A parte de endereço de um condomínio — o que estas funções precisam ler. */
export interface EnderecoLegivel {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}

/**
 * Endereço em uma linha, para cabeçalho e listagem.
 *
 * `Rua Halfeld, 1179 — Bloco A · Centro · Juiz de Fora/MG · 36010-000`
 *
 * Cada separador aparece **só quando há os dois lados**. Um endereço pela metade
 * é o caso comum (condomínio cadastrado antes da migration 035, ou criado com o
 * mínimo), e formatar com placeholder produziria coisas como `, s/n — · /MG ·`,
 * que parecem defeito da tela em vez de cadastro incompleto.
 */
export function enderecoLinha(c: EnderecoLegivel): string {
  const rua = [c.endereco, c.numero].filter(Boolean).join(', ');
  const municipio = [c.cidade, c.estado].filter(Boolean).join('/');

  return [
    [rua, c.complemento].filter(Boolean).join(' — '),
    c.bairro,
    municipio,
    formatarCep(c.cep) || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Só cidade e UF — o recorte que cabe numa coluna de tabela.
 *
 * Existe separado porque a listagem de condomínios não tem largura para a linha
 * inteira, e cortar com reticências esconderia justamente a cidade, que é por
 * onde se procura.
 */
export function municipioLinha(c: EnderecoLegivel): string {
  return [c.cidade, c.estado].filter(Boolean).join('/');
}
