import { FormEvent, useEffect, useState } from 'react';
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
  User, Truck, Building2, KeyRound, FileText, Loader2 
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"; icon: React.ElementType }> = {
  aguardando: { label: 'Aguardando Retirada', variant: 'warning', icon: Clock },
  notificado: { label: 'Morador Notificado', variant: 'info', icon: Clock },
  retirada: { label: 'Entregue', variant: 'success', icon: CheckCircle2 },
  cancelada: { label: 'Cancelada', variant: 'secondary', icon: XCircle },
  devolvida: { label: 'Devolvida', variant: 'secondary', icon: XCircle },
};

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

  // Timeline Eventos
  const eventos = [
    { label: 'Recebimento', date: enc.createdAt, done: true },
    { label: 'Notificação', date: enc.notificadaAt, done: !!enc.notificadaAt, error: enc.notificacao?.status === 'failed' },
    { label: enc.status === 'cancelada' ? 'Cancelamento' : 'Retirada', date: enc.retiradaAt, done: !!enc.retiradaAt || enc.status === 'cancelada' },
  ];

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
        {/* Coluna Esquerda: Timeline e Ações */}
        <div className="space-y-6 md:col-span-1">
          {/* Status / Ações */}
          {ativa ? (
            <Card className="border-primary/40">
              <CardHeader className="border-b border-border pb-4">
                <p className="eyebrow">Ação</p>
                <CardTitle className="text-lg">Registrar retirada</CardTitle>
                <CardDescription>Como o morador vai comprovar a retirada?</CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">

                {/* Abas */}
                <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
                  <button
                    type="button"
                    onClick={() => setTab('codigo')}
                    className={cn(
                      "min-h-[40px] flex-1 rounded-md text-sm font-medium transition-all",
                      tab === 'codigo' ? "bg-card text-foreground shadow-panel" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Código
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('documento')}
                    className={cn(
                      "min-h-[40px] flex-1 rounded-md text-sm font-medium transition-all",
                      tab === 'documento' ? "bg-card text-foreground shadow-panel" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Documento
                  </button>
                </div>

                <form onSubmit={retirar} className="space-y-4">
                  {tab === 'codigo' ? (
                    <div className="space-y-2 text-center">
                      <Label>Código de 4 dígitos (recebido no Zap)</Label>
                      <Input
                        className="h-16 text-center font-mono text-4xl tracking-[0.5em]"
                        placeholder="0000"
                        maxLength={4}
                        pattern="\d{4}"
                        inputMode="numeric"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Número do Documento</Label>
                      <Input
                        className="h-12 text-lg"
                        placeholder="CPF, RG, etc..."
                        value={documento}
                        onChange={(e) => setDocumento(e.target.value)}
                        autoFocus
                      />
                    </div>
                  )}
                  
                  <Button type="submit" disabled={saving} size="lg" className="w-full font-semibold">
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
                  "mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4",
                  enc.status === 'retirada' ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
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

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {eventos.map((ev, i) => (
                  <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    {/* Icon */}
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-4 border-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm",
                      ev.error ? "bg-destructive text-destructive-foreground" : 
                      ev.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      {ev.done ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                    </div>
                    {/* Content */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-lg border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("font-medium", ev.done ? "text-foreground" : "text-muted-foreground")}>{ev.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ev.date ? formatDateTime(ev.date) : 'Pendente'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {ativa && isAdmin && (
            <div className="pt-2">
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowCancel(true)}>
                <XCircle className="mr-2 h-4 w-4" /> Cancelar Encomenda
              </Button>
            </div>
          )}
        </div>

        {/* Coluna Direita: Dados */}
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Detalhes da Encomenda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground mb-1"><Building2 className="mr-2 h-4 w-4" /> Apartamento</div>
                  <div className="font-mono text-xl font-bold">{enc.apartamento?.identificador}</div>
                </div>
                
                {ativa && (
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center text-sm text-muted-foreground"><KeyRound className="mr-2 h-4 w-4" /> Código enviado ao morador</div>
                    <CodigoStrip codigo={enc.codigoRetirada} size="lg" active={enc.status === 'notificado'} />
                  </div>
                )}
                
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground mb-1"><User className="mr-2 h-4 w-4" /> Destinatário</div>
                  <div className="font-medium text-lg">{enc.moradorDestino?.nome || 'Qualquer morador'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground mb-1"><Package className="mr-2 h-4 w-4" /> Código de Rastreio</div>
                  <div className="font-mono font-medium">{enc.codigoRastreio || '—'}</div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center text-sm text-muted-foreground mb-1"><Truck className="mr-2 h-4 w-4" /> Transportadora</div>
                  <div className="font-medium">{enc.transportadora || '—'}</div>
                </div>
                
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center text-sm text-muted-foreground mb-1"><FileText className="mr-2 h-4 w-4" /> Descrição</div>
                  <div className="font-medium">{enc.descricao || 'Sem descrição detalhada'}</div>
                </div>
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
