import { NotificacaoResumo, WaStatus } from '../api/types';
import { cn } from '@/lib/utils';
import {
  Clock, Send, CheckCheck, Eye, AlertTriangle, Inbox, type LucideIcon,
} from 'lucide-react';

const MAP: Record<WaStatus, { label: string; cls: string; icon: LucideIcon }> = {
  queued: { label: 'Na fila', cls: 'border-border bg-muted text-muted-foreground', icon: Clock },
  sent: { label: 'Enviado', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400', icon: Send },
  delivered: { label: 'Entregue', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: CheckCheck },
  read: { label: 'Lido', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: Eye },
  failed: { label: 'Falhou', cls: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400', icon: AlertTriangle },
  received: { label: 'Recebido', cls: 'border-border bg-muted text-muted-foreground', icon: Inbox },
};

export function NotifBadge({ notif, showDetail }: { notif?: NotificacaoResumo | null; showDetail?: boolean }) {
  if (!notif) return null;
  const m = MAP[notif.status] ?? MAP.sent;
  const Icon = m.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider',
        m.cls,
      )}
      title={notif.errorMessage ?? undefined}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="normal-case tracking-normal">WhatsApp · {m.label}</span>
      {showDetail && notif.status === 'failed' && notif.errorMessage
        ? <span className="normal-case tracking-normal opacity-80">· {notif.errorMessage}</span>
        : null}
    </span>
  );
}
