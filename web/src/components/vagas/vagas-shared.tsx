import { Bike, Car, Accessibility, Truck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatarTelefone } from '@/lib/telefone';
import type {
  SituacaoVaga,
  StatusCobranca,
  StatusLocacao,
  TipoVaga,
  VagaLocacao,
} from '@/api/types';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

export const TIPO_VAGA_LABEL: Record<TipoVaga, string> = {
  carro: 'Carro',
  moto: 'Moto',
  grande: 'Vaga grande',
  pcd: 'PCD',
};

export const TIPO_VAGA_ICON: Record<TipoVaga, LucideIcon> = {
  carro: Car,
  moto: Bike,
  grande: Truck,
  pcd: Accessibility,
};

export const SITUACAO_META: Record<SituacaoVaga, { label: string; variant: BadgeVariant; ajuda: string }> = {
  livre: {
    label: 'Livre',
    variant: 'success',
    ajuda: 'Disponível para locação.',
  },
  vinculada: {
    label: 'Do apartamento',
    variant: 'info',
    ajuda: 'Uso próprio da unidade — não entra no pool de locação.',
  },
  alugada: {
    label: 'Alugada',
    variant: 'warning',
    ajuda: 'Tem contrato vigente.',
  },
  inativa: {
    label: 'Inativa',
    variant: 'secondary',
    ajuda: 'Fora de operação.',
  },
};

export const STATUS_LOCACAO_META: Record<StatusLocacao, { label: string; variant: BadgeVariant }> = {
  ativa: { label: 'Ativa', variant: 'success' },
  inadimplente: { label: 'Inadimplente', variant: 'destructive' },
  encerrada: { label: 'Encerrada', variant: 'secondary' },
};

export const STATUS_COBRANCA_META: Record<StatusCobranca, { label: string; variant: BadgeVariant }> = {
  pendente: { label: 'A enviar', variant: 'secondary' },
  enviada: { label: 'Enviada', variant: 'info' },
  paga: { label: 'Paga', variant: 'success' },
  vencida: { label: 'Vencida', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'outline' },
};

// Dinheiro, data e competência moraram aqui até a tela de Assinatura precisar
// dos mesmos formatos. Reexportados para não quebrar quem já importava daqui.
export {
  competenciaAtual,
  fmtCompetencia,
  fmtData,
  fmtMoeda,
  hojeLocal,
} from '@/lib/formato';

/** Nome do responsável, seja morador cadastrado ou pessoa externa. */
export function nomeLocatario(locacao: VagaLocacao): string {
  if (locacao.locatarioTipo === 'externo') return locacao.locatarioNome || 'Locatário externo';
  return locacao.morador?.nome || 'Morador não informado';
}

export function contatoLocatario(locacao: VagaLocacao): string | null {
  const telefone =
    locacao.locatarioTipo === 'externo'
      ? locacao.locatarioTelefoneE164
      : locacao.morador?.telefoneE164;
  if (telefone) return formatarTelefone(telefone);

  return locacao.locatarioTipo === 'externo'
    ? locacao.locatarioEmail
    : locacao.morador?.email || null;
}

export function SituacaoBadge({ situacao }: { situacao: SituacaoVaga }) {
  const meta = SITUACAO_META[situacao] ?? SITUACAO_META.livre;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
