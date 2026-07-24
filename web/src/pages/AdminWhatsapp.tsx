import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { AdminWhatsappCondominio, AdminWhatsappResponse } from '@/api/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TemplateEditor } from '@/components/whatsapp/TemplateEditor';
import { Smartphone, Package, Megaphone, Settings2, Loader2, Save, CheckCircle2, Plus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditState {
  intervaloSegundos: number;
  jitterSegundos: number;
  limiteDiario: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  templateEncomenda: string;
}

function StatusBadge({ c }: { c: AdminWhatsappCondominio }) {
  if (c.conectado) {
    return (
      <Badge variant="success" className="gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Conectado
      </Badge>
    );
  }
  if (!c.provisionado) return <Badge variant="outline">Sem instância</Badge>;
  return <Badge variant="secondary" className="capitalize">{c.status ?? 'desconectado'}</Badge>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 leading-tight">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function AdminWhatsapp() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminWhatsappCondominio | null>(null);
  const [form, setForm] = useState<EditState | null>(null);

  const query = useQuery({
    queryKey: ['admin-whatsapp'],
    queryFn: () => api.get<AdminWhatsappResponse>('/admin/whatsapp'),
  });

  useEffect(() => {
    if (editing) {
      setForm({
        intervaloSegundos: editing.intervaloSegundos,
        jitterSegundos: editing.jitterSegundos,
        limiteDiario: editing.limiteDiario,
        horarioEnvioInicio: editing.horarioEnvioInicio,
        horarioEnvioFim: editing.horarioEnvioFim,
        templateEncomenda: editing.templateEncomenda,
      });
    } else {
      setForm(null);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: (payload: EditState) => api.patch(`/admin/whatsapp/${editing!.id}`, payload),
    onSuccess: () => {
      toast.success('Configuração salva!');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp'] });
      setEditing(null);
    },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao salvar'),
  });

  const [provisioningId, setProvisioningId] = useState<string | null>(null);

  const provisionMutation = useMutation({
    mutationFn: (tenantId: string) => api.post(`/admin/whatsapp/${tenantId}/provision`),
    onMutate: (tenantId) => setProvisioningId(tenantId),
    onSuccess: () => {
      toast.success('Instância criada! Já pode ser conectada pelo condomínio.');
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp'] });
    },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao criar a instância'),
    onSettled: () => setProvisioningId(null),
  });

  const provisionAllMutation = useMutation({
    mutationFn: () =>
      api.post<{ total: number; provisionadas: number; falhas: { nome: string; erro: string }[] }>(
        '/admin/whatsapp/provision-missing',
      ),
    onSuccess: (r) => {
      if (r.total === 0) toast.info('Nenhum condomínio pendente de instância.');
      else if (r.falhas.length === 0) toast.success(`${r.provisionadas} instância(s) criada(s) com sucesso!`);
      else toast.warning(`${r.provisionadas} criada(s), ${r.falhas.length} com falha (${r.falhas[0].nome}: ${r.falhas[0].erro}).`);
      queryClient.invalidateQueries({ queryKey: ['admin-whatsapp'] });
    },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao provisionar pendentes'),
  });

  const pendentes = (query.data?.condominios ?? []).filter((c) => c.ativo && !c.provisionado).length;

  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="WhatsApp dos Condomínios"
          description="Status da conexão, disparos realizados e regras de envio (anti-bloqueio) de cada condomínio."
        />
        {pendentes > 0 && (
          <Button
            onClick={() => provisionAllMutation.mutate()}
            disabled={provisionAllMutation.isPending}
            className="min-h-[44px] shrink-0"
          >
            {provisionAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            Criar {pendentes} instância(s) pendente(s)
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {query.data?.condominios.map((c) => (
            <Card key={c.id} className={cn(!c.ativo && 'opacity-60')}>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                      c.conectado ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )}>
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">{c.nome}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {c.conectado && c.numero ? `+${c.numero}` : c.slug}
                      </p>
                    </div>
                  </div>
                  <StatusBadge c={c} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Metric icon={Package} label="Encomendas enviadas" value={c.disparosEncomenda} />
                  <Metric icon={Megaphone} label="Avisos enviados" value={c.disparosAviso} />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Intervalo: <b className="text-foreground">{c.intervaloSegundos}s + até {c.jitterSegundos}s</b></span>
                  <span>Janela: <b className="text-foreground">{c.horarioEnvioInicio}–{c.horarioEnvioFim}</b></span>
                  <span>Limite: <b className="text-foreground">{c.limiteDiario > 0 ? `${c.limiteDiario}/dia` : '—'}</b></span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {c.templateEncomenda ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Template personalizado</>
                    ) : 'Template padrão'}
                  </span>
                  <div className="flex gap-2">
                    {!c.provisionado && (
                      <Button
                        size="sm"
                        onClick={() => provisionMutation.mutate(c.id)}
                        disabled={provisioningId === c.id}
                        className="min-h-[40px]"
                      >
                        {provisioningId === c.id
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <Plus className="mr-2 h-4 w-4" />}
                        Criar instância
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setEditing(c)} className="min-h-[40px]">
                      <Settings2 className="mr-2 h-4 w-4" /> Configurar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Regras de disparo — {editing?.nome}</DialogTitle>
            <DialogDescription>
              Ajuste o ritmo de envio (anti-bloqueio) e o modelo de mensagem deste condomínio.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-6 py-2">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="intervalo">Intervalo fixo (s)</Label>
                  <Input id="intervalo" type="number" min={0} max={3600} value={form.intervaloSegundos}
                    onChange={(e) => setForm({ ...form, intervaloSegundos: num(e.target.value, 0) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jitter">Aleatório até (s)</Label>
                  <Input id="jitter" type="number" min={0} max={3600} value={form.jitterSegundos}
                    onChange={(e) => setForm({ ...form, jitterSegundos: num(e.target.value, 0) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="limite">Limite diário</Label>
                  <Input id="limite" type="number" min={0} max={100000} value={form.limiteDiario}
                    onChange={(e) => setForm({ ...form, limiteDiario: num(e.target.value, 0) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inicio">Envio a partir de</Label>
                  <Input id="inicio" type="time" value={form.horarioEnvioInicio}
                    onChange={(e) => setForm({ ...form, horarioEnvioInicio: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fim">Envio até</Label>
                  <Input id="fim" type="time" value={form.horarioEnvioFim}
                    onChange={(e) => setForm({ ...form, horarioEnvioFim: e.target.value })} />
                </div>
              </div>

              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Cada mensagem espera <b>{form.intervaloSegundos}s</b> + um tempo aleatório de até{' '}
                <b>{form.jitterSegundos}s</b> após a anterior. Limite de <b>0</b> = sem limite diário.
              </p>

              <TemplateEditor
                value={form.templateEncomenda}
                onChange={(v) => setForm({ ...form, templateEncomenda: v })}
                variaveis={query.data?.variaveis ?? []}
                templatePadrao={query.data?.templatePadrao ?? ''}
                disabled={saveMutation.isPending}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saveMutation.isPending}>Cancelar</Button>
            <Button onClick={() => form && saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
