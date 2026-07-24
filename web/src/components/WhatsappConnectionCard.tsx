import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  Smartphone, QrCode, CheckCircle2, Loader2, Power, RefreshCw,
  Link2, AlertTriangle, ShieldQuestion,
} from 'lucide-react';
import { api, ApiError } from '@/api/client';
import { WhatsappConnection, WhatsappQr } from '@/api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATE_META: Record<
  WhatsappConnection['state'],
  { label: string; badge: 'default' | 'secondary' | 'destructive' | 'outline'; dot: string }
> = {
  connected: { label: 'Conectado', badge: 'default', dot: 'bg-emerald-500' },
  connecting: { label: 'Conectando…', badge: 'secondary', dot: 'bg-amber-500 animate-pulse' },
  qr: { label: 'Aguardando leitura do QR', badge: 'secondary', dot: 'bg-amber-500 animate-pulse' },
  disconnected: { label: 'Desconectado', badge: 'outline', dot: 'bg-slate-400' },
  error: { label: 'Erro de conexão', badge: 'destructive', dot: 'bg-red-500' },
};

export function WhatsappConnectionCard() {
  const queryClient = useQueryClient();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connQuery = useQuery({
    queryKey: ['whatsapp-connection'],
    queryFn: () => api.get<WhatsappConnection>('/whatsapp/connection'),
    // Enquanto não conectado, revalida sozinho para refletir a evolução do pareamento.
    refetchInterval: (query) => {
      const s = query.state.data?.state;
      return s && s !== 'connected' ? 5000 : false;
    },
  });

  const conn = connQuery.data;
  const showQr = conn?.state === 'qr' || conn?.state === 'connecting';

  // Busca o QR apenas durante o pareamento; o QR do WhatsApp rotaciona, então revalida rápido.
  const qrQuery = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn: () => api.get<WhatsappQr>('/whatsapp/connection/qr'),
    enabled: Boolean(conn?.configured && conn?.provisioned && showQr),
    refetchInterval: 4000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-connection'] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-qr'] });
  };

  const connectMutation = useMutation({
    mutationFn: () => api.post<WhatsappConnection>('/whatsapp/connection/connect'),
    onSuccess: () => { toast.success('Iniciando conexão. Leia o QR Code no WhatsApp do condomínio.'); invalidate(); },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao iniciar a conexão'),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.post<WhatsappConnection>('/whatsapp/connection/restart'),
    onSuccess: () => { toast.success('Novo QR Code gerado.'); invalidate(); },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao gerar novo QR Code'),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => api.post<WhatsappConnection>('/whatsapp/connection/disconnect'),
    onSuccess: () => { toast.success('WhatsApp desconectado.'); setConfirmDisconnect(false); invalidate(); },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao desconectar'),
  });

  if (connQuery.isLoading) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  // Integração desligada no servidor (sem OPENWA_BASE_URL/API_KEY).
  if (conn && !conn.configured) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3">
          <ShieldQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-base font-semibold text-foreground">Integração WhatsApp não configurada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              O gateway de WhatsApp (OpenWA) ainda não está habilitado neste ambiente. Fale com o administrador da plataforma.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const meta = STATE_META[conn?.state ?? 'disconnected'];
  const busy = connectMutation.isPending || restartMutation.isPending || disconnectMutation.isPending;

  return (
    <Card className="overflow-hidden">
      <CardContent>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          {/* Identidade + status */}
          <div className="flex items-start gap-3">
            <div className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              conn?.connected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
            )}>
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">WhatsApp do condomínio</h3>
                <Badge variant={meta.badge} className="gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {meta.label}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {conn?.connected
                  ? 'Número conectado e pronto para enviar as notificações.'
                  : 'Conecte o número do condomínio para disparar as mensagens no WhatsApp.'}
              </p>
              {conn?.connected && conn.phone && (
                <p className="mt-2 font-mono text-sm text-foreground">
                  {conn.pushName ? `${conn.pushName} · ` : ''}+{conn.phone}
                </p>
              )}
              {conn?.state === 'error' && conn.lastError && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {conn.lastError}
                </p>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex shrink-0 flex-wrap gap-2">
            {conn?.connected ? (
              <Button
                variant="outline"
                size="lg"
                className="min-h-[48px]"
                onClick={() => setConfirmDisconnect(true)}
                disabled={busy}
              >
                <Power className="mr-2 h-5 w-5" /> Desconectar
              </Button>
            ) : showQr ? (
              <Button
                variant="outline"
                size="lg"
                className="min-h-[48px]"
                onClick={() => restartMutation.mutate()}
                disabled={busy}
              >
                {restartMutation.isPending
                  ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  : <RefreshCw className="mr-2 h-5 w-5" />}
                Gerar novo QR Code
              </Button>
            ) : (
              <Button
                size="lg"
                className="min-h-[48px]"
                onClick={() => connectMutation.mutate()}
                disabled={busy}
              >
                {connectMutation.isPending
                  ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  : <Link2 className="mr-2 h-5 w-5" />}
                Conectar WhatsApp
              </Button>
            )}
          </div>
        </div>

        {/* Área do QR Code durante o pareamento */}
        <AnimatePresence>
          {showQr && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-5 flex flex-col items-center gap-4 rounded-xl border border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-lg bg-white p-3 shadow-sm">
                  {qrQuery.data?.qrCode ? (
                    <img src={qrQuery.data.qrCode} alt="QR Code para conectar o WhatsApp" className="h-full w-full" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="text-sm">Gerando QR Code…</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <QrCode className="h-5 w-5" /> Como conectar
                  </div>
                  <ol className="space-y-2 text-sm text-muted-foreground">
                    <li>1. Abra o <span className="font-medium text-foreground">WhatsApp</span> no celular do condomínio.</li>
                    <li>2. Toque em <span className="font-medium text-foreground">Configurações → Aparelhos conectados</span>.</li>
                    <li>3. Toque em <span className="font-medium text-foreground">Conectar um aparelho</span>.</li>
                    <li>4. Aponte a câmera para este QR Code.</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">O código é atualizado automaticamente. A tela muda sozinha ao conectar.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmação de conexão bem-sucedida (transitório visual) */}
        {conn?.connected && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Tudo certo — as notificações serão enviadas por este número.
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar o WhatsApp?"
        description="O condomínio deixará de enviar notificações até reconectar. A instância é mantida — basta ler o QR Code novamente para voltar."
        confirmLabel="Desconectar"
        variant="destructive"
        loading={disconnectMutation.isPending}
        onConfirm={() => disconnectMutation.mutate()}
      />
    </Card>
  );
}
