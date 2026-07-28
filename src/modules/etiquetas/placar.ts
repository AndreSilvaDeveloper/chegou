import type { CamposEtiqueta, EtiquetaAmostra } from '../../database/entities';
import { normalizar } from './parser/texto';

export const CAMPOS_ETIQUETA = [
  'destinatario',
  'bloco',
  'numero',
  'andar',
  'transportadora',
  'codigoRastreio',
  'cep',
] as const;

export type CampoEtiqueta = (typeof CAMPOS_ETIQUETA)[number];

export interface PlacarCampo {
  campo: CampoEtiqueta;
  /** Amostras conferidas em que este campo foi avaliado. */
  total: number;
  acertos: number;
}

export interface PlacarTransportadora {
  transportadora: string;
  amostras: number;
  /** Campos certos / campos avaliados, somando as amostras do grupo. */
  acertos: number;
  total: number;
}

export interface Placar {
  parserVersao: string;
  amostrasTotal: number;
  amostrasConferidas: number;
  campos: PlacarCampo[];
  porTransportadora: PlacarTransportadora[];
}

/**
 * Dois valores contam como iguais se batem depois de normalizados e sem
 * pontuação: `36010-000` = `36010000`, `Apto 302` = `APTO 302`.
 *
 * `null` de um lado só e `null` dos dois lados são casos diferentes de
 * propósito: acertar que a etiqueta NÃO traz o bloco é acerto, e some do placar
 * se a gente ignorar os nulos.
 */
export function mesmoValor(a: string | null | undefined, b: string | null | undefined): boolean {
  const va = a ?? null;
  const vb = b ?? null;
  if (va === null || vb === null) return va === vb;
  const limpar = (s: string) => normalizar(s).replace(/[^A-Z0-9]/g, '');
  return limpar(va) === limpar(vb);
}

/** Campo a campo: o parser bateu com o gabarito? */
export function compararAmostra(
  extraido: CamposEtiqueta | null,
  gabarito: CamposEtiqueta,
): Record<CampoEtiqueta, boolean> {
  const resultado = {} as Record<CampoEtiqueta, boolean>;
  for (const campo of CAMPOS_ETIQUETA) {
    resultado[campo] = mesmoValor(extraido?.[campo] ?? null, gabarito[campo] ?? null);
  }
  return resultado;
}

/**
 * Placar do parser sobre as amostras já conferidas.
 *
 * Amostra sem gabarito fica de fora: ela não diz nada sobre acerto, e contá-la
 * como erro faria o placar despencar toda vez que alguém subisse fotos novas.
 */
export function montarPlacar(amostras: EtiquetaAmostra[], parserVersao: string): Placar {
  const conferidas = amostras.filter((a) => a.gabarito);

  const campos: PlacarCampo[] = CAMPOS_ETIQUETA.map((campo) => ({ campo, total: 0, acertos: 0 }));
  const porTransportadora = new Map<string, PlacarTransportadora>();

  for (const amostra of conferidas) {
    const comparacao = compararAmostra(amostra.extraido, amostra.gabarito!);
    const rotulo = amostra.transportadora?.trim() || 'Sem rótulo';

    const grupo = porTransportadora.get(rotulo) ?? {
      transportadora: rotulo,
      amostras: 0,
      acertos: 0,
      total: 0,
    };
    grupo.amostras += 1;

    for (const item of campos) {
      const acertou = comparacao[item.campo];
      item.total += 1;
      grupo.total += 1;
      if (acertou) {
        item.acertos += 1;
        grupo.acertos += 1;
      }
    }

    porTransportadora.set(rotulo, grupo);
  }

  return {
    parserVersao,
    amostrasTotal: amostras.length,
    amostrasConferidas: conferidas.length,
    campos,
    // Pior primeiro: a tela existe para mostrar onde consertar.
    porTransportadora: [...porTransportadora.values()].sort(
      (a, b) => a.acertos / (a.total || 1) - b.acertos / (b.total || 1),
    ),
  };
}
