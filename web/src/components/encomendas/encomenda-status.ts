import {
  CheckCircle2,
  Clock,
  MessageCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { EncomendaStatus } from '@/api/types';
import type { Tone } from '@/components/ui/status-dot';

/**
 * O estado da encomenda, em um lugar só.
 *
 * Antes a listagem e a tela de detalhe tinham cada uma o seu mapa: na lista o
 * status era um ponto colorido "Aguardando"; no detalhe, um badge com outra
 * cor e outro texto ("Aguardando Retirada"). Mesmo dado, duas identidades —
 * e nada garantia que um status novo entrasse nos dois.
 *
 * - `label` — o texto curto, do ponto de status (listagem, cabeçalho).
 * - `descricao` — a frase da tela de detalhe, onde há largura para explicar.
 * - `tone` — a cor, do mesmo mapa do `StatusDot`. É ela que pinta também o
 *   marco correspondente na linha do tempo.
 * - `pulse` — o estado ainda está em movimento (o pacote espera alguém).
 */
export const ENCOMENDA_STATUS: Record<
  EncomendaStatus,
  { label: string; descricao: string; tone: Tone; icon: LucideIcon; pulse?: boolean }
> = {
  aguardando: {
    label: 'Aguardando',
    descricao: 'Aguardando retirada',
    tone: 'waiting',
    icon: Clock,
    pulse: true,
  },
  notificado: {
    label: 'Notificado',
    descricao: 'Morador notificado',
    tone: 'notified',
    icon: MessageCircle,
    pulse: true,
  },
  retirada: {
    label: 'Retirada',
    descricao: 'Entregue ao morador',
    tone: 'done',
    icon: CheckCircle2,
  },
  cancelada: {
    label: 'Cancelada',
    descricao: 'Encomenda cancelada',
    tone: 'danger',
    icon: XCircle,
  },
  devolvida: {
    label: 'Devolvida',
    descricao: 'Devolvida ao remetente',
    tone: 'neutral',
    icon: XCircle,
  },
};

/** Ainda está na portaria esperando alguém buscar. */
export const encomendaPendente = (status: EncomendaStatus) =>
  status === 'aguardando' || status === 'notificado';
