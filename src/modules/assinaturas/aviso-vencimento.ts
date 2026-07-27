import { StatusFatura } from '../../database/entities/assinatura-fatura.entity';
import { diasEntre, hojeISO } from './datas';

/**
 * O aviso de vencimento da assinatura, para o cliente ver no painel.
 *
 * Módulo puro de propósito: a regra de "quando avisar" é a que mais tende a
 * mudar de ideia, e ela não deveria exigir banco nem HTTP para ser testada.
 */

/**
 * Com quantos dias de antecedência o cliente passa a ser avisado.
 *
 * Três dias cobrem o esquecimento sem virar insistência: menos que isso não dá
 * tempo de um pagamento cair antes do vencimento; mais que isso e o aviso vira
 * paisagem — quando a fatura vence de fato, ninguém olha mais para ele.
 */
export const DIAS_DE_ANTECEDENCIA = 3;

export type SituacaoVencimento = 'vence_em_breve' | 'vence_hoje' | 'vencida';

/** O que uma fatura precisa ter para ser avaliada — não a entidade inteira. */
export interface FaturaAvaliavel {
  id: string;
  competencia: string;
  vencimento: string;
  valor: number;
  status: StatusFatura;
}

export interface AvisoVencimento {
  situacao: SituacaoVencimento;
  /** A fatura em destaque: a mais urgente das que estão em aberto. */
  faturaId: string;
  competencia: string;
  vencimento: string;
  valor: number;
  /** Dias até vencer. Negativo é atraso: `-2` é "venceu anteontem". */
  diasParaVencer: number;
  /** Soma de tudo em aberto, não só da fatura em destaque. */
  totalEmAberto: number;
  quantidadeEmAberto: number;
}

const EM_ABERTO: StatusFatura[] = [StatusFatura.ABERTA, StatusFatura.VENCIDA];

/** Duas casas, como o resto do módulo: somar float acumula centavo fantasma. */
function emCentavos(valores: number[]): number {
  return Math.round(valores.reduce((soma, valor) => soma + Math.round(valor * 100), 0)) / 100;
}

/**
 * O aviso que o cliente deve ver, ou `null` quando não há o que avisar.
 *
 * Avisa a partir de `DIAS_DE_ANTECEDENCIA` do vencimento e continua avisando
 * enquanto a fatura estiver em aberto — vencida não some da tela, porque é
 * justamente quando o aviso importa.
 *
 * **Quem decide a situação é a data, não o `status`.** A fatura só vira
 * `vencida` no banco quando alguém consulta (`atualizarVencidas`); confiar no
 * status faria a tela mostrar "em aberto" numa fatura que venceu ontem, só
 * porque ninguém passou por ali ainda.
 */
export function avaliarVencimento(
  faturas: FaturaAvaliavel[],
  hoje: string = hojeISO(),
): AvisoVencimento | null {
  const emAberto = faturas.filter((fatura) => EM_ABERTO.includes(fatura.status));
  if (emAberto.length === 0) return null;

  // A mais urgente é sempre a de vencimento mais antigo — inclusive havendo
  // atraso, porque a mais velha é a que corre há mais tempo.
  const proxima = emAberto.reduce((a, b) => (a.vencimento <= b.vencimento ? a : b));
  const diasParaVencer = diasEntre(hoje, proxima.vencimento);

  if (diasParaVencer > DIAS_DE_ANTECEDENCIA) return null;

  return {
    situacao:
      diasParaVencer < 0 ? 'vencida' : diasParaVencer === 0 ? 'vence_hoje' : 'vence_em_breve',
    faturaId: proxima.id,
    competencia: proxima.competencia,
    vencimento: proxima.vencimento,
    valor: proxima.valor,
    diasParaVencer,
    totalEmAberto: emCentavos(emAberto.map((fatura) => fatura.valor)),
    quantidadeEmAberto: emAberto.length,
  };
}
