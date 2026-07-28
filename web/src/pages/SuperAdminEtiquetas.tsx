import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import {
  CAMPOS_ETIQUETA,
  ROTULO_CAMPO_ETIQUETA,
  type CampoEtiqueta,
  type CamposEtiqueta,
  type EtiquetaAmostra,
  type EtiquetaAmostraResumo,
  type EtiquetasStatus,
  type PlacarEtiquetas,
  type UploadAmostrasResposta,
} from '@/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleSelect } from '@/components/ui/simple-select';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle, Check, ImagePlus, Loader2, RefreshCw, ScanText, Tag, Trash2, X, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mensagemErro } from '@/lib/erros';

const VAZIO: CamposEtiqueta = {
  destinatario: null, bloco: null, numero: null, andar: null,
  transportadora: null, codigoRastreio: null, cep: null,
};

function percentual(acertos: number, total: number): number {
  return total === 0 ? 0 : Math.round((acertos / total) * 100);
}

/** Verde só acima de 90%: abaixo disso o campo ainda dá trabalho ao porteiro. */
function corDoAcerto(pct: number): string {
  if (pct >= 90) return 'text-emerald-600 dark:text-emerald-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function BarraAcerto({ acertos, total }: { acertos: number; total: number }) {
  const pct = percentual(acertos, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-lg font-bold', corDoAcerto(pct))}>{pct}%</span>
        <span className="font-mono text-xs text-muted-foreground">{acertos}/{total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Conferência de uma amostra: foto ao lado do que o parser leu.
 *
 * O botão "usar o que o parser leu" existe porque, quando ele acerta, marcar o
 * gabarito tem que custar um clique — senão ninguém confere 50 fotos.
 */
function DialogoConferencia({
  amostraId,
  onClose,
}: {
  amostraId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [gabarito, setGabarito] = useState<CamposEtiqueta>(VAZIO);
  const [transportadora, setTransportadora] = useState('');
  const [observacao, setObservacao] = useState('');
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  const { data: amostra, isLoading } = useQuery({
    queryKey: ['etiqueta-amostra', amostraId],
    queryFn: () => api.get<EtiquetaAmostra>(`/admin/etiquetas/amostras/${amostraId}`),
  });

  useEffect(() => {
    if (!amostra) return;
    setGabarito(amostra.gabarito ?? VAZIO);
    setTransportadora(amostra.transportadora ?? '');
    setObservacao(amostra.observacao ?? '');
    setConfirmandoRemocao(false);
  }, [amostra]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['etiqueta-amostras'] });
    queryClient.invalidateQueries({ queryKey: ['etiquetas-placar'] });
    queryClient.invalidateQueries({ queryKey: ['etiquetas-status'] });
  };

  const salvar = useMutation({
    mutationFn: () =>
      api.patch(`/admin/etiquetas/amostras/${amostraId}`, {
        gabarito,
        transportadora: transportadora.trim() || null,
        observacao: observacao.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Gabarito salvo');
      invalidar();
      onClose();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível salvar o gabarito')),
  });

  const remover = useMutation({
    mutationFn: () => api.delete(`/admin/etiquetas/amostras/${amostraId}`),
    onSuccess: () => {
      toast.success('Amostra removida');
      invalidar();
      onClose();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível remover')),
  });

  const usarExtraido = () => {
    if (!amostra?.extraido) return;
    setGabarito(amostra.extraido);
    if (amostra.extraido.transportadora) setTransportadora(amostra.extraido.transportadora);
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText className="h-5 w-5 text-primary" /> Conferir amostra
          </DialogTitle>
          <DialogDescription>
            Corrija o que a etiqueta realmente diz. É esse gabarito que mede o parser.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !amostra ? (
          <div className="space-y-3">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Foto + texto cru do OCR */}
            <div className="space-y-3">
              <a href={amostra.fotoUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={amostra.fotoUrl}
                  alt="Etiqueta"
                  className="max-h-72 w-full rounded-xl border border-border object-contain"
                />
              </a>
              <div>
                <Label className="mb-1.5 flex items-center gap-2 text-sm">
                  <ScanText className="h-4 w-4 text-muted-foreground" />
                  O que o OCR leu
                  {amostra.ocrMs != null && (
                    <span className="font-mono text-xs text-muted-foreground">{amostra.ocrMs}ms</span>
                  )}
                </Label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
                  {amostra.ocrLinhas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      O OCR não encontrou texto nenhum nesta imagem.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {amostra.ocrLinhas.map((linha, i) => (
                        <li key={i} className="flex items-baseline gap-2 font-mono text-xs">
                          <span
                            className={cn(
                              'shrink-0 tabular-nums',
                              linha.confianca < 0.7 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                            )}
                          >
                            {Math.round(linha.confianca * 100)}%
                          </span>
                          <span className="text-foreground">{linha.texto}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Gabarito */}
            <div className="space-y-3">
              <Button type="button" variant="outline" onClick={usarExtraido} className="min-h-[48px] w-full">
                <Wand2 className="mr-2 h-4 w-4" /> Usar o que o parser leu
              </Button>

              {CAMPOS_ETIQUETA.map((campo) => {
                const lido = amostra.extraido?.[campo] ?? null;
                const atual = gabarito[campo] ?? '';
                const bate = (lido ?? '') === atual;
                return (
                  <div key={campo} className="space-y-1">
                    <Label htmlFor={`g-${campo}`} className="text-sm">
                      {ROTULO_CAMPO_ETIQUETA[campo]}
                    </Label>
                    <Input
                      id={`g-${campo}`}
                      className="h-11"
                      value={atual}
                      placeholder="(vazio na etiqueta)"
                      onChange={(e) =>
                        setGabarito((g) => ({ ...g, [campo]: e.target.value || null }))
                      }
                    />
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {bate ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      )}
                      Parser leu: <span className="font-mono">{lido ?? '—'}</span>
                    </p>
                  </div>
                );
              })}

              <div className="space-y-1">
                <Label htmlFor="g-rotulo" className="text-sm">Rótulo da transportadora</Label>
                <Input
                  id="g-rotulo"
                  className="h-11"
                  value={transportadora}
                  placeholder="Ex: Correios"
                  onChange={(e) => setTransportadora(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Serve para agrupar o placar por transportadora.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="g-obs" className="text-sm">Observação</Label>
                <Input
                  id="g-obs"
                  className="h-11"
                  value={observacao}
                  placeholder="Ex: foto tremida, etiqueta amassada"
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant={confirmandoRemocao ? 'destructive' : 'ghost'}
            className="min-h-[48px]"
            disabled={remover.isPending}
            onClick={() => (confirmandoRemocao ? remover.mutate() : setConfirmandoRemocao(true))}
          >
            {remover.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {confirmandoRemocao ? 'Confirmar remoção' : 'Remover amostra'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-[48px]" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-[48px]"
              disabled={salvar.isPending || isLoading}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar gabarito
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardAmostra({
  amostra,
  onAbrir,
}: {
  amostra: EtiquetaAmostraResumo;
  onAbrir: () => void;
}) {
  const resumo = [amostra.extraido?.bloco, amostra.extraido?.numero].filter(Boolean).join('-');
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:border-primary/50 hover:shadow-panel"
    >
      <img
        src={amostra.fotoUrl}
        alt="Etiqueta"
        loading="lazy"
        className="h-36 w-full bg-muted object-cover"
      />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={amostra.conferida ? 'success' : 'outline'} className="gap-1">
            {amostra.conferida ? <Check className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
            {amostra.conferida ? 'Conferida' : 'Pendente'}
          </Badge>
          {amostra.transportadora && (
            <span className="truncate text-xs text-muted-foreground">{amostra.transportadora}</span>
          )}
        </div>
        <p className="truncate text-sm font-medium text-foreground">
          {amostra.extraido?.destinatario ?? 'Sem destinatário lido'}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {resumo || '— sem destino lido —'}
        </p>
      </div>
    </button>
  );
}

export function SuperAdminEtiquetas() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTransportadora, setFiltroTransportadora] = useState('');

  const status = useQuery({
    queryKey: ['etiquetas-status'],
    queryFn: () => api.get<EtiquetasStatus>('/admin/etiquetas/status'),
  });

  const placar = useQuery({
    queryKey: ['etiquetas-placar'],
    queryFn: () => api.get<PlacarEtiquetas>('/admin/etiquetas/placar'),
  });

  const amostras = useQuery({
    queryKey: ['etiqueta-amostras', filtroStatus, filtroTransportadora],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filtroStatus) p.set('status', filtroStatus);
      if (filtroTransportadora) p.set('transportadora', filtroTransportadora);
      const qs = p.toString();
      return api.get<EtiquetaAmostraResumo[]>(`/admin/etiquetas/amostras${qs ? `?${qs}` : ''}`);
    },
  });

  const invalidarTudo = () => {
    queryClient.invalidateQueries({ queryKey: ['etiqueta-amostras'] });
    queryClient.invalidateQueries({ queryKey: ['etiquetas-placar'] });
    queryClient.invalidateQueries({ queryKey: ['etiquetas-status'] });
  };

  const enviar = useMutation({
    mutationFn: (arquivos: FileList) => {
      const fd = new FormData();
      Array.from(arquivos).forEach((f) => fd.append('files', f));
      return api.upload<UploadAmostrasResposta>('/admin/etiquetas/amostras', fd);
    },
    onSuccess: (r) => {
      if (r.criadas.length) toast.success(`${r.criadas.length} amostra(s) processada(s)`);
      // Falha por arquivo aparece uma a uma: num lote de 20, saber "3 falharam"
      // sem saber quais não ajuda ninguém.
      r.falhas.forEach((f) => toast.error(`${f.arquivo}: ${f.erro}`));
      invalidarTudo();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível enviar as fotos')),
  });

  const reprocessar = useMutation({
    mutationFn: () => api.post<PlacarEtiquetas>('/admin/etiquetas/reprocessar'),
    onSuccess: (p) => {
      toast.success(`Parser v${p.parserVersao} rodado em ${p.amostrasTotal} amostra(s)`);
      invalidarTudo();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível reprocessar')),
  });

  const transportadoras = useMemo(() => {
    const nomes = new Set(
      (amostras.data ?? []).map((a) => a.transportadora).filter((t): t is string => !!t),
    );
    return [...nomes].sort();
  }, [amostras.data]);

  const ocrForaDoAr = status.data && !status.data.ocrDisponivel;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Etiquetas"
        description="Banco de amostras que calibra a leitura automática de etiqueta."
      />

      {ocrForaDoAr && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">
              {status.data?.ocrConfigurado ? 'Serviço de OCR fora do ar' : 'OCR não configurado'}:
            </span>{' '}
            {status.data?.ocrConfigurado
              ? 'o container `ocr` não respondeu. Enviar fotos vai falhar até ele voltar.'
              : 'defina OCR_BASE_URL e suba o container `ocr` para poder enviar amostras.'}
          </span>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const arquivos = e.target.files;
            if (arquivos?.length) enviar.mutate(arquivos);
            // Zera para permitir reenviar o mesmo arquivo depois de um erro.
            e.target.value = '';
          }}
        />
        <Button
          className="min-h-[48px] flex-1"
          disabled={enviar.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {enviar.isPending ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="mr-2 h-5 w-5" />
          )}
          {enviar.isPending ? 'Lendo as etiquetas...' : 'Enviar fotos de etiqueta'}
        </Button>
        <Button
          variant="outline"
          className="min-h-[48px] flex-1"
          disabled={reprocessar.isPending}
          onClick={() => reprocessar.mutate()}
        >
          {reprocessar.isPending ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-5 w-5" />
          )}
          Reprocessar e medir
        </Button>
      </div>

      {/* Placar */}
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">Acerto do parser</h2>
            <p className="text-sm text-muted-foreground">
              {placar.data
                ? `${placar.data.amostrasConferidas} de ${placar.data.amostrasTotal} amostras conferidas · parser v${placar.data.parserVersao}`
                : '—'}
            </p>
          </div>

          {placar.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : !placar.data?.amostrasConferidas ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma amostra conferida ainda. Envie fotos e marque o gabarito de cada uma —
              o placar só conta amostra com gabarito, senão ele despencaria toda vez que
              você subisse fotos novas.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {placar.data.campos.map((c) => (
                  <div key={c.campo} className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {ROTULO_CAMPO_ETIQUETA[c.campo as CampoEtiqueta]}
                    </p>
                    <BarraAcerto acertos={c.acertos} total={c.total} />
                  </div>
                ))}
              </div>

              {placar.data.porTransportadora.length > 1 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">
                    Por transportadora <span className="text-muted-foreground">(pior primeiro)</span>
                  </h3>
                  <div className="space-y-1.5">
                    {placar.data.porTransportadora.map((t) => (
                      <div
                        key={t.transportadora}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <span className="truncate text-sm text-foreground">{t.transportadora}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="text-xs text-muted-foreground">{t.amostras} amostra(s)</span>
                          <span className={cn('text-sm font-semibold', corDoAcerto(percentual(t.acertos, t.total)))}>
                            {percentual(t.acertos, t.total)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-status">Status</Label>
          <SimpleSelect
            id="f-status"
            value={filtroStatus}
            onValueChange={setFiltroStatus}
            options={[
              { value: '', label: 'Todas' },
              { value: 'pendente', label: 'Só pendentes' },
              { value: 'conferida', label: 'Só conferidas' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-transportadora">Transportadora</Label>
          <SimpleSelect
            id="f-transportadora"
            value={filtroTransportadora}
            onValueChange={setFiltroTransportadora}
            options={[
              { value: '', label: 'Todas' },
              ...transportadoras.map((t) => ({ value: t, label: t })),
            ]}
          />
        </div>
      </div>

      {/* Lista */}
      {amostras.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-60" />)}
        </div>
      ) : !amostras.data?.length ? (
        <EmptyState
          icon={ImagePlus}
          title="Nenhuma amostra ainda"
          description="Fotografe etiquetas reais — de preferência tortas, com reflexo e amassadas, do jeito que o porteiro fotografa — e envie aqui."
          actionLabel="Enviar fotos"
          onAction={() => inputRef.current?.click()}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {amostras.data.map((a) => (
            <CardAmostra key={a.id} amostra={a} onAbrir={() => setAbertaId(a.id)} />
          ))}
        </div>
      )}

      {abertaId && (
        <DialogoConferencia amostraId={abertaId} onClose={() => setAbertaId(null)} />
      )}
    </div>
  );
}
