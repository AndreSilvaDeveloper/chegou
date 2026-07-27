import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmtCompetencia, fmtData, fmtMoeda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import type {
  AvisoVencimento,
  ModoAssinatura,
  ResultadoAssinatura,
  SituacaoVencimento,
  StatusFatura,
} from '@/api/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

export const STATUS_FATURA_META: Record<StatusFatura, { label: string; variant: BadgeVariant }> = {
  aberta: { label: 'Em aberto', variant: 'info' },
  paga: { label: 'Paga', variant: 'success' },
  vencida: { label: 'Vencida', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'outline' },
};

export const MODO_LABEL: Record<ModoAssinatura, string> = {
  tabela: 'Tabela de preços',
  preco_apartamento: 'Preço negociado por apartamento',
  valor_fixo: 'Valor fixo mensal',
};

export function StatusFaturaBadge({ status }: { status: StatusFatura }) {
  const meta = STATUS_FATURA_META[status] ?? STATUS_FATURA_META.aberta;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/**
 * Aparência do aviso de vencimento — usada pela faixa e pelo ponto no menu.
 *
 * Vermelho só depois de vencer. "Vence hoje" ainda é âmbar de propósito: quem
 * está em dia não deveria ver a cor de erro por estar cumprindo o prazo.
 */
export const AVISO_VENCIMENTO_META: Record<
  SituacaoVencimento,
  { titulo: string; urgente: boolean }
> = {
  vence_em_breve: { titulo: 'Fatura perto do vencimento', urgente: false },
  vence_hoje: { titulo: 'A fatura vence hoje', urgente: false },
  vencida: { titulo: 'Fatura vencida', urgente: true },
};

/** O aviso em uma frase, com a fatura, o valor e a distância até o vencimento. */
function fraseDoAviso(aviso: AvisoVencimento): string {
  const fatura = `A fatura de ${fmtCompetencia(aviso.competencia)}, de ${fmtMoeda(aviso.valor)},`;

  if (aviso.situacao === 'vence_hoje') return `${fatura} vence hoje.`;

  if (aviso.situacao === 'vence_em_breve') {
    const quando = aviso.diasParaVencer === 1 ? 'amanhã' : `em ${aviso.diasParaVencer} dias`;
    return `${fatura} vence ${quando}, dia ${fmtData(aviso.vencimento)}.`;
  }

  const atraso = Math.abs(aviso.diasParaVencer);
  return `${fatura} venceu dia ${fmtData(aviso.vencimento)}, há ${
    atraso === 1 ? '1 dia' : `${atraso} dias`
  }.`;
}

/**
 * A faixa de aviso no topo da tela de assinatura.
 *
 * Existe porque a fatura da plataforma não passa pela rotina de ninguém: sem um
 * aviso na própria tela, o cliente só descobre o atraso quando alguém liga. Ela
 * não some depois de vencer — é aí que ela mais importa.
 */
export function AvisoVencimentoFaixa({ aviso }: { aviso: AvisoVencimento }) {
  const { titulo, urgente } = AVISO_VENCIMENTO_META[aviso.situacao];
  const Icone = urgente ? AlertTriangle : CalendarClock;

  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-xl border p-4 md:p-5',
        urgente
          ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      )}
    >
      <Icone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm">{fraseDoAviso(aviso)}</p>

        {aviso.quantidadeEmAberto > 1 && (
          <p className="text-sm">
            São {aviso.quantidadeEmAberto} faturas em aberto, somando{' '}
            {fmtMoeda(aviso.totalEmAberto)}.
          </p>
        )}

        {/* A baixa ainda é manual: sem esta linha, quem acabou de pagar acha
            que o pagamento não foi registrado e abre chamado. */}
        {urgente && (
          <p className="text-sm opacity-80">
            Já pagou? O registro é feito manualmente e pode levar até um dia útil para aparecer
            aqui.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A conta em uma frase: por que o valor é esse.
 *
 * Existe porque "R$ 191,95" sozinho não deixa ninguém conferir nada. Quem lê
 * precisa ver a quantidade, o preço unitário e de onde ele veio — é a diferença
 * entre confiar na fatura e ligar para o suporte.
 */
export function ComoFoiCalculado({ resultado }: { resultado: ResultadoAssinatura }) {
  const { modo, quantidadeApartamentos, precoAplicado, faixa, desconto, valorBruto } = resultado;

  const base =
    modo === 'valor_fixo'
      ? `Valor fixo mensal de ${fmtMoeda(valorBruto)}, independente da quantidade de apartamentos.`
      : `${quantidadeApartamentos} apartamento${quantidadeApartamentos === 1 ? '' : 's'} ativo${
          quantidadeApartamentos === 1 ? '' : 's'
        } × ${fmtMoeda(precoAplicado)} = ${fmtMoeda(valorBruto)}`;

  const origem =
    modo === 'tabela' && faixa
      ? faixa.ateQuantidade === null
        ? `Faixa acima de ${quantidadeApartamentos > 0 ? 'todas as anteriores' : 'a tabela'}.`
        : `Faixa de até ${faixa.ateQuantidade} apartamentos.`
      : modo === 'preco_apartamento'
        ? 'Preço negociado — não usa a tabela da plataforma.'
        : null;

  return (
    <div className="space-y-1.5 text-sm text-muted-foreground">
      <p className="text-foreground">{base}</p>
      {origem && <p>{origem}</p>}
      {desconto > 0 && <p>Desconto aplicado: −{fmtMoeda(desconto)}</p>}
    </div>
  );
}
