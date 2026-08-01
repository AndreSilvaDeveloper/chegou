import { FormEvent, useEffect, useState, ComponentType, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, getUser } from '../api/client';
import { Encomenda } from '../api/types';
import { NotifBadge } from '../components/NotifBadge';
import { PageShell } from '@/components/ui/page-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CodigoStrip } from '@/components/ui/codigo-strip';
import { SegmentedFilter, type OpcaoSegmento } from '@/components/ui/segmented-filter';
import { StatusDot, TONE, type Tone } from '@/components/ui/status-dot';
import { ENCOMENDA_STATUS, encomendaPendente } from '@/components/encomendas/encomenda-status';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, cn } from '@/lib/utils';
import {
  Package, CheckCircle2, XCircle,
  User, Truck, Building2, KeyRound, FileText, Loader2, Box, Mail,
  Lock, ShieldCheck, MessageCircle, CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * Um dado da encomenda: ícone em bloco chapado, rótulo `eyebrow`, valor.
 *
 * É o cabeçalho do `ListCard` virado de lado — mesmo bloco de 40px em
 * `bg-muted`, mesmo rótulo mono maiúsculo. Quem abre o detalhe vindo do card da
 * listagem não vê a tipografia mudar de personagem.
 */
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
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <div className="mt-1 txt-corpo text-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Como o porteiro confirma a retirada. Era um `TabButton` local com a própria
 * pele; agora é o `SegmentedFilter`, o mesmo controle das outras telas.
 */
const FORMAS_RETIRADA: OpcaoSegmento<'codigo' | 'documento'>[] = [
  { valor: 'codigo', label: 'Código', icone: KeyRound },
  { valor: 'documento', label: 'Documento', icone: CreditCard },
];

export function DetalheEncomenda() {
  const { id } = useParams<{ id: string }>();
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
    // Carregando dentro da casca de sempre: o porteiro continua vendo a seta de
    // voltar e o esqueleto já tem a forma das duas colunas que vão chegar.
    return (
      <PageShell icon={Package} eyebrow="Encomenda" title="Detalhe" voltar="/encomendas">
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96 rounded-surface" />
          <Skeleton className="h-96 rounded-surface md:col-span-2" />
        </div>
      </PageShell>
    );
  }

  const ativa = encomendaPendente(enc.status);
  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';
  const podeVerCodigo = isAdmin; // porteiro NÃO vê o código — só o morador o conhece
  const conf = ENCOMENDA_STATUS[enc.status] ?? ENCOMENDA_STATUS.aguardando;
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

  // Linha do tempo. O `tone` de cada marco é o MESMO do ponto de status da
  // listagem (`TONE`, de `status-dot.tsx`): recebida é âmbar como "Aguardando",
  // notificada é o azul de "Notificado", entregue é o verde de "Retirada".
  const eventos: {
    label: string;
    hint: string;
    date: string | null;
    done: boolean;
    tone: Tone;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    {
      label: 'Encomenda recebida',
      hint: 'Registrada na portaria',
      date: enc.createdAt,
      done: true,
      tone: 'waiting',
      icon: Package,
    },
    {
      label: 'Morador notificado',
      hint: enc.notificacao?.status === 'failed' ? 'Falha no envio' : 'Aviso enviado no WhatsApp',
      date: enc.notificadaAt,
      done: !!enc.notificadaAt,
      tone: enc.notificacao?.status === 'failed' ? 'danger' : 'notified',
      icon: MessageCircle,
    },
    {
      label: enc.status === 'cancelada' ? 'Encomenda cancelada' : 'Encomenda entregue',
      hint: enc.status === 'cancelada' ? 'Não pode mais ser retirada' : 'Retirada confirmada',
      date: enc.retiradaAt || enc.canceladaAt,
      done: !!enc.retiradaAt || enc.status === 'cancelada',
      tone: enc.status === 'cancelada' ? 'danger' : 'done',
      icon: enc.status === 'cancelada' ? XCircle : CheckCircle2,
    },
  ];

  return (
    <PageShell
      icon={Package}
      eyebrow="Encomenda"
      title={`Apto ${enc.apartamento?.identificador}`}
      // Sem `description` e sem busca: numa tela de detalhe o título já é o
      // registro. O botão da esquerda da barra do topo vira a seta de voltar.
      voltar="/encomendas"
      // O mesmo ponto de status do card da listagem, com o texto longo: quem
      // clicou num card "Aguardando" reencontra o mesmo sinal aqui em cima.
      acoes={<StatusDot tone={conf.tone} label={conf.descricao} pulse={conf.pulse} />}
    >
      <div className="space-y-6">
      {enc.notificacao?.status === 'failed' && (
        <div className="flex items-start gap-3 rounded-surface bg-destructive/10 p-4 text-destructive">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15"
          >
            <XCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow text-destructive/80">Falha no WhatsApp</p>
            <p className="mt-1 txt-corpo font-medium">
              A mensagem não foi entregue ao morador
              {enc.notificacao.errorMessage ? ` (${enc.notificacao.errorMessage})` : ''}.
            </p>
            <p className="mt-1 txt-apoio text-destructive/80">
              Confira em WhatsApp se a conexão do condomínio está ativa e se o número do morador
              tem WhatsApp.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Coluna Esquerda: Ação e Timeline */}
        <div className="space-y-6 md:col-span-1">
          {ativa ? (
            <Card>
              <CardHeader className="pb-4">
                {/* Mesmo bloco chapado de ícone do card da listagem — nada de
                    âmbar aqui: o sinal fica com o botão que conclui a entrega. */}
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                  >
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle>Entregar encomenda</CardTitle>
                    <CardDescription>Confirme a retirada pelo morador</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0 md:pt-0">
                {/* Passo a passo didático, em bloco chapado */}
                <ol className="space-y-2 rounded-lg bg-muted p-3 txt-corpo">
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card font-mono txt-nota font-bold text-foreground">1</span>
                    <span className="text-muted-foreground">Peça ao morador o <span className="font-semibold text-foreground">código de 4 dígitos</span> que ele recebeu no WhatsApp.</span>
                  </li>
                  <li className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card font-mono txt-nota font-bold text-foreground">2</span>
                    <span className="text-muted-foreground">Digite abaixo e toque em <span className="font-semibold text-foreground">Confirmar</span>.</span>
                  </li>
                </ol>

                {/* Como o porteiro vai confirmar a retirada: código ou documento */}
                <SegmentedFilter
                  aria="Forma de confirmar a retirada"
                  valor={tab}
                  aoMudar={setTab}
                  opcoes={FORMAS_RETIRADA}
                />

                <form onSubmit={retirar} className="space-y-4">
                  {tab === 'codigo' ? (
                    <div className="space-y-2 text-center">
                      <Label htmlFor="codigo-retirada">Código de 4 dígitos</Label>
                      <Input
                        id="codigo-retirada"
                        // Campo herói, e a única altura à mão da tela: ele é o
                        // gêmeo do `CodigoStrip` (mesma fonte, mesmo espaço
                        // entre dígitos), não um campo de formulário comum.
                        className="h-15 text-center font-mono text-2xl tracking-[0.5em] rounded-full"
                        placeholder="0000"
                        maxLength={4}
                        pattern="\d{4}"
                        inputMode="numeric"
                        value={codigo}
                        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                        autoFocus
                      />
                      <p className="flex items-center justify-center gap-1.5 txt-apoio text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" /> O morador recebeu este código no WhatsApp.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="documento-retirada">Número do documento</Label>
                      <Input
                        id="documento-retirada"
                        placeholder="CPF, RG, etc..."
                        value={documento}
                        onChange={(e) => setDocumento(e.target.value)}
                        autoFocus
                      />
                      <p className="txt-apoio text-muted-foreground">Use quando o morador não tiver o código em mãos.</p>
                    </div>
                  )}

                  {/* O único âmbar da tela — é ele que conclui a entrega. */}
                  <Button type="submit" disabled={saving} size="lg" className="w-full">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Confirmar entrega
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center">
                <div className={cn(
                  'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full',
                  enc.status === 'retirada'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  <StatusIcon className="h-8 w-8" />
                </div>
                <h3 className="txt-secao font-semibold">{conf.descricao}</h3>
                {enc.retiradaAt && (
                  <p className="mt-1 txt-apoio text-muted-foreground">Em {formatDateTime(enc.retiradaAt)}</p>
                )}

                {enc.retiradaDocumento && (
                  <div className="mt-4 rounded-lg bg-muted p-3 text-left">
                    <p className="eyebrow">Documento apresentado</p>
                    <p className="mt-1 font-mono txt-corpo">{enc.retiradaDocumento}</p>
                  </div>
                )}

                {enc.cancelamentoMotivo && (
                  <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-left">
                    <p className="eyebrow text-destructive/80">Motivo do cancelamento</p>
                    <p className="mt-1 txt-corpo text-foreground">{enc.cancelamentoMotivo}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Linha do tempo (vertical) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Linha do tempo</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 md:pt-0">
              <ol className="relative space-y-6">
                {eventos.map((ev, i) => {
                  const EvIcon = ev.icon;
                  const isLast = i === eventos.length - 1;
                  return (
                    <li key={i} className="relative flex gap-4">
                      {!isLast && (
                        <span
                          aria-hidden
                          className="absolute left-[19px] top-10 h-[calc(100%-1rem)] w-0.5 bg-border"
                        />
                      )}
                      {/* O marco cumprido usa a COR DO ESTADO (o mesmo mapa do
                          ponto de status da listagem); o que ainda não
                          aconteceu fica chapado, sem cor nenhuma. */}
                      <span
                        aria-hidden
                        className={cn(
                          'z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-card',
                          ev.done ? `${TONE[ev.tone]} text-white` : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <EvIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 pt-1">
                        <p className={cn('txt-subtitulo font-semibold leading-tight', !ev.done && 'text-muted-foreground')}>
                          {ev.label}
                        </p>
                        <p className="txt-apoio text-muted-foreground">{ev.hint}</p>
                        <p className="mt-0.5 font-mono txt-nota text-muted-foreground">
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
              <XCircle className="mr-2 h-4 w-4" /> Cancelar encomenda
            </Button>
          )}
        </div>

        {/* Coluna Direita: Dados */}
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Detalhes da encomenda</CardTitle>
              <CardDescription>Todas as informações registradas na portaria.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-0 md:pt-0">
              {/* Código de retirada — visibilidade controlada por perfil */}
              {ativa && (
                podeVerCodigo ? (
                  // Sem caixa em volta: o `CodigoStrip` JÁ é o elemento de
                  // assinatura, e embrulhá-lo num bloco âmbar era caixa dentro
                  // de caixa. Só o rótulo `eyebrow` em cima, como nos campos.
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 eyebrow">
                      <ShieldCheck className="h-3 w-3 shrink-0" />
                      Código enviado ao morador
                    </p>
                    <CodigoStrip codigo={enc.codigoRetirada} size="lg" active={enc.status === 'notificado'} />
                    <p className="txt-apoio text-muted-foreground">
                      Visível só para a administração — o porteiro pede o código ao morador.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg bg-muted p-4">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground"
                    >
                      <Lock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="txt-subtitulo font-semibold">O código fica só com o morador</p>
                      <p className="mt-0.5 txt-apoio text-muted-foreground">
                        Ele recebeu os 4 dígitos por WhatsApp. Na hora da retirada, peça o código e digite no campo ao lado.
                      </p>
                    </div>
                  </div>
                )
              )}

              <div className="grid gap-6 sm:grid-cols-2">
                {/* Mesma ênfase do campo `enfase` do `ListCard`: o dado que a
                    tela existe para mostrar sobe de tamanho, e só ele. */}
                <DetailItem icon={Building2} label="Apartamento">
                  <span className="font-mono txt-numero-sm font-semibold">{enc.apartamento?.identificador}</span>
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

                <DetailItem icon={Package} label="Código de rastreio">
                  <span className="font-mono">{enc.codigoRastreio || '—'}</span>
                </DetailItem>

                <DetailItem icon={FileText} label="Descrição" className="sm:col-span-2">
                  {enc.descricao || 'Sem descrição detalhada'}
                </DetailItem>
              </div>

              {enc.notificacao && (
                <div>
                  <p className="eyebrow">Status do WhatsApp</p>
                  <div className="mt-1">
                    <NotifBadge notif={enc.notificacao} showDetail />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {enc.fotoUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Foto do pacote</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 md:pt-0">
                <a
                  href={enc.fotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg bg-muted transition-opacity hover:opacity-90"
                >
                  <img
                    src={enc.fotoUrl}
                    alt="Foto da encomenda"
                    className="max-h-[400px] w-full object-cover"
                  />
                </a>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title="Cancelar encomenda"
        description="Esta ação não pode ser desfeita. A encomenda constará como cancelada e não poderá mais ser retirada."
        confirmLabel="Confirmar cancelamento"
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
    </PageShell>
  );
}
