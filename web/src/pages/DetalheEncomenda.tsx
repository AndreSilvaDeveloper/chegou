import { FormEvent, useEffect, useState, ComponentType, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getUser } from '../api/client';
import { Encomenda } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CodigoStrip } from '@/components/ui/codigo-strip';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, cn } from '@/lib/utils';
import {
  ArrowLeft, Package, Clock, CheckCircle2, XCircle,
  User, Truck, Building2, KeyRound, FileText, Loader2, Box, Mail,
  Lock, ShieldCheck, MessageCircle, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

type StatusVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

const STATUS_CONFIG: Record<string, { label: string; variant: StatusVariant; icon: ComponentType<{ className?: string }> }> = {
  aguardando: { label: 'Aguardando Retirada', variant: 'warning', icon: Clock },
  notificado: { label: 'Morador Notificado', variant: 'info', icon: MessageCircle },
  retirada: { label: 'Entregue', variant: 'success', icon: CheckCircle2 },
  cancelada: { label: 'Cancelada', variant: 'secondary', icon: XCircle },
  devolvida: { label: 'Devolvida', variant: 'secondary', icon: XCircle },
};

/** Item de detalhe com ícone em caixa — leitura fácil. */
function DetailItem({
  icon: Icon, label, children, className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function DetalheEncomenda() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const user = getUser();
  const [enc, setEnc] = useState<Encomenda | null>(null);

  // Retirada
  const [codigo, setCodigo] = useState('');
  const [documento, setDocumento] = useState('');
  const [tab, setTab] = useState<'codigo' | 'documento'>('codigo');
  const [saving, setSaving] = useState(false);

  // Cancelamento
  const [motivo, setMotivo] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const load = () => api.get<Encomenda>(`/encomendas/${id}`).then(setEnc).catch(() => toast.error('Encomenda não encontrada'));

  useEffect(() => {
    load();
  }, [id]);

  if (!enc) {
    return (
      <div className="space-y-6 pb-10">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const ativa = enc.status === 'aguardando' || enc.status === 'notificado';
  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';
  const podeVerCodigo = isAdmin; // porteiro NÃO vê o código — só o morador o conhece
  const conf = STATUS_CONFIG[enc.status] || STATUS_CONFIG.aguardando;
  const StatusIcon = conf.icon;

  const retirar = async (e: FormEvent) => {
    e.preventDefault();
    if (tab === 'codigo' && codigo.length !== 4) {
      toast.error('O código deve ter 4 dígitos');
      return;
    }
    if (tab === 'documento' && !documento.trim()) {
      toast.error('Informe o documento');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/encomendas/${enc.id}/retirar`, {
        codigoRetirada: tab === 'codigo' ? codigo : undefined,
        documentoRetirada: tab === 'documento' ? documento : undefined,
      });
      toast.success('Retirada registrada com sucesso!');
      await load();
      setCodigo('');
      setDocumento('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar retirada');
    } finally {
      setSaving(false);
    }
  };

  const cancelar = async () => {
    if (!motivo.trim()) {
      toast.error('O motivo do cancelamento é obrigatório');
      return;
    }
    setCanceling(true);
    try {
      await api.post(`/encomendas/${enc.id}/cancelar`, { motivo });
      toast.success('Encomenda cancelada com sucesso!');
      await load();
      setShowCancel(false);
      setMotivo('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar encomenda');
    } finally {
      setCanceling(false);
    }
  };

  // Linha do tempo
  const eventos = [
    { label: 'Encomenda recebida', hint: 'Registrada na portaria', date: enc.createdAt, done: true, icon: Package },
    {
      label: 'Morador notificado',
      hint: enc.notificacao?.status === 'failed' ? 'Falha no envio' : 'Aviso enviado no WhatsApp',
      date: enc.notificadaAt,
      done: !!enc.notificadaAt,
      error: enc.notificacao?.status === 'failed',
      icon: MessageCircle,
    },
    {
      label: enc.status === 'cancelada' ? 'Encomenda cancelada' : 'Encomenda entregue',
      hint: enc.status === 'cancelada' ? 'Não pode mais ser retirada' : 'Retirada confirmada',
      date: enc.retiradaAt || enc.canceladaAt,
      done: !!enc.retiradaAt || enc.status === 'cancelada',
      error: enc.status === 'cancelada',
      icon: enc.status === 'cancelada' ? XCircle : CheckCircle2,
    },
  ];

  const TabButton = ({ value, icon: Icon, label }: { value: 'codigo' | 'documento'; icon: ComponentType<{ className?: string }>; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      className={cn(
        'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-all',
        tab === value ? 'bg-card text-foreground shadow-panel' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={`Apto ${enc.apartamento?.identificador}`}
          description={enc.descricao || 'Detalhes da encomenda'}
          className="mb-0 border-0 pb-0"
        >
          <Badge variant={conf.variant} className="text-sm py-1 px-3">
            <StatusIcon className="mr-2 h-4 w-4" />
            {conf.label}
          </Badge>
        </PageHeader>
      </div>

      {enc.notificacao?.status === 'failed' && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          <div className="font-semibold flex items-center mb-1">
            <XCircle className="mr-2 h-4 w-4" />
            Falha na Notificação do WhatsApp
          </div>
          <p>A mensagem não foi entregue ao morador{enc.notificacao.errorMessage ? ` (${enc.notificacao.errorMessage})` : ''}.</p>
          <p className="mt-2 text-xs opacity-80">
            Dica: Se estiver usando o Sandbox da Twilio, o morador precisa enviar a mensagem de adesão para o número antes de receber notificações.
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Coluna Esquerda: Ação e Timeline */}
        <div className="space-y-6 md:col-span-1">
          {ativa ? (
            <Card className="border-primary/40 shadow-panel">
              <CardHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Entregar encomenda</CardTitle>
                    <CardDescription>Confirme a retirada pelo morador</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {/* Passo a passo didático */}
                <ol className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
                    <span className="text-muted-foreground">Peça ao morador o <span className="font-semibold text-foreground">código de 4 dígitos</span> que ele recebeu no WhatsApp.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
                    <span className="text-muted-foreground">Digite abaixo e toque em <span className="font-semibold text-foreground">Confirmar</span>.</span>
                  </li>
                </ol>

                {/* Abas Código / Documento */}
                <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
                  <TabButton value="codigo" icon={KeyRound} label="Código" />
                  <TabButton value="documento" icon={CreditCard} label="Documento" />
                </div>

                <form onSubmit={retirar} className="space-y-4">
                  {tab === 'codigo' ? (
                    <div className="space-y-2 text-center">
                      <Label htmlFor="codigo-retirada">Código de 4 dígitos</Label>
                      <Input
                        id="codigo-retirada"
                        className="h-20 text-center font-mono text-5xl tracking-[0.4em]"
                        placeholder="0000"
                        maxLength={4}
                        pattern="\d{4}"
                        inputMode="numeric"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                      />
                      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" /> O morador recebeu este código no WhatsApp.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="documento-retirada">Número do Documento</Label>
                      <Input
                        id="documento-retirada"
                        className="h-14 text-lg"
                        placeholder="CPF, RG, etc..."
                        value={documento}
                        onChange={(e) => setDocumento(e.target.value)}
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground">Use quando o morador não tiver o código em mãos.</p>
                    </div>
                  )}

                  <Button type="submit" disabled={saving} size="lg" className="h-14 w-full text-base font-semibold">
                    {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                    Confirmar Entrega
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center">
                <div className={cn(
                  'mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4',
                  enc.status === 'retirada' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                )}>
                  <StatusIcon className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold">{conf.label}</h3>
                {enc.retiradaAt && <p className="text-sm text-muted-foreground mt-1">Em {formatDateTime(enc.retiradaAt)}</p>}

                {enc.retiradaDocumento && (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                    <span className="text-muted-foreground block mb-1">Documento apresentado:</span>
                    <span className="font-mono font-medium">{enc.retiradaDocumento}</span>
                  </div>
                )}

                {enc.cancelamentoMotivo && (
                  <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-left">
                    <span className="text-destructive font-medium block mb-1">Motivo do Cancelamento:</span>
                    {enc.cancelamentoMotivo}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Linha do tempo (vertical) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-6">
                {eventos.map((ev, i) => {
                  const EvIcon = ev.icon;
                  const isLast = i === eventos.length - 1;
                  return (
                    <li key={i} className="relative flex gap-4">
                      {!isLast && (
                        <span
                          className={cn(
                            'absolute left-[19px] top-10 h-[calc(100%-1rem)] w-0.5',
                            ev.done ? 'bg-primary/30' : 'bg-border',
                          )}
                        />
                      )}
                      <div className={cn(
                        'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-background',
                        ev.error ? 'bg-destructive text-destructive-foreground' :
                          ev.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        <EvIcon className="h-5 w-5" />
                      </div>
                      <div className="pt-1">
                        <p className={cn('font-medium leading-tight', ev.done ? 'text-foreground' : 'text-muted-foreground')}>{ev.label}</p>
                        <p className="text-xs text-muted-foreground">{ev.hint}</p>
                        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                          {ev.date ? formatDateTime(ev.date) : 'Pendente'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {ativa && isAdmin && (
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowCancel(true)}>
              <XCircle className="mr-2 h-4 w-4" /> Cancelar Encomenda
            </Button>
          )}
        </div>

        {/* Coluna Direita: Dados */}
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Detalhes da Encomenda</CardTitle>
              <CardDescription>Todas as informações registradas na portaria.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Código de retirada — visibilidade controlada por perfil */}
              {ativa && (
                podeVerCodigo ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldCheck className="h-4 w-4 text-primary" /> Código enviado ao morador
                      <Badge variant="outline" className="ml-auto text-[11px]">Visível para administração</Badge>
                    </div>
                    <CodigoStrip codigo={enc.codigoRetirada} size="lg" active={enc.status === 'notificado'} />
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-foreground">O código fica só com o morador</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Ele recebeu os 4 dígitos por WhatsApp. Na hora da retirada, peça o código e digite no campo ao lado.
                      </p>
                    </div>
                  </div>
                )
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                <DetailItem icon={Building2} label="Apartamento">
                  <span className="font-mono text-xl font-bold">{enc.apartamento?.identificador}</span>
                </DetailItem>

                <DetailItem icon={User} label="Destinatário">
                  {enc.moradorDestino?.nome || 'Qualquer morador'}
                </DetailItem>

                <DetailItem icon={enc.tipo === 'envelope' ? Mail : Box} label="Tipo">
                  {enc.tipo === 'caixa' ? 'Caixa' : enc.tipo === 'envelope' ? 'Envelope' : '—'}
                </DetailItem>

                <DetailItem icon={Truck} label="Transportadora">
                  {enc.transportadora || '—'}
                </DetailItem>

                <DetailItem icon={Package} label="Código de Rastreio">
                  <span className="font-mono">{enc.codigoRastreio || '—'}</span>
                </DetailItem>

                <DetailItem icon={FileText} label="Descrição" className="sm:col-span-2">
                  {enc.descricao || 'Sem descrição detalhada'}
                </DetailItem>
              </div>

              {enc.notificacao && (
                <div className="pt-4 border-t">
                  <div className="text-sm font-medium mb-2">Status do WhatsApp</div>
                  <NotifBadge notif={enc.notificacao} showDetail />
                </div>
              )}
            </CardContent>
          </Card>

          {enc.fotoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Foto do Pacote</CardTitle>
              </CardHeader>
              <CardContent>
                <a href={enc.fotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border hover:opacity-90 transition-opacity">
                  <img src={enc.fotoUrl} alt="Foto da encomenda" className="w-full object-cover max-h-[400px]" />
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title="Cancelar Encomenda"
        description="Esta ação não pode ser desfeita. A encomenda constará como cancelada e não poderá mais ser retirada."
        confirmLabel="Confirmar Cancelamento"
        variant="destructive"
        loading={canceling}
        onConfirm={cancelar}
      >
        <div className="py-4 space-y-2">
          <Label>Motivo do cancelamento *</Label>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Devolvida ao remetente, pacote danificado..."
            autoFocus
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
