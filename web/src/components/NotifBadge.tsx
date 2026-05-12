import { NotificacaoResumo, WaStatus } from '../api/types';

const MAP: Record<WaStatus, { label: string; cls: string }> = {
  queued: { label: 'WhatsApp na fila', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'WhatsApp enviado', cls: 'bg-blue-50 text-blue-700' },
  delivered: { label: 'WhatsApp entregue', cls: 'bg-emerald-50 text-emerald-700' },
  read: { label: 'WhatsApp lido', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'WhatsApp falhou', cls: 'bg-red-50 text-red-700' },
  received: { label: 'WhatsApp recebido', cls: 'bg-slate-100 text-slate-600' },
};

export function NotifBadge({ notif, showDetail }: { notif?: NotificacaoResumo | null; showDetail?: boolean }) {
  if (!notif) return null;
  const m = MAP[notif.status] ?? MAP.sent;
  return (
    <span className={`badge ${m.cls}`} title={notif.errorMessage ?? undefined}>
      {notif.status === 'failed' ? '⚠ ' : ''}
      {m.label}
      {showDetail && notif.status === 'failed' && notif.errorMessage ? ` · ${notif.errorMessage}` : ''}
    </span>
  );
}
