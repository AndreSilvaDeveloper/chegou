import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { WhatsappTenantConfig } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateEditor } from '@/components/whatsapp/TemplateEditor';
import { Clock, Save, Loader2, Timer, CalendarClock, Gauge } from 'lucide-react';
import { toast } from 'sonner';

function InfoPill({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function WhatsappTemplateCard() {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState('');

  const configQuery = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => api.get<WhatsappTenantConfig>('/whatsapp/config'),
  });

  useEffect(() => {
    if (configQuery.data) setTemplate(configQuery.data.templateEncomenda);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch<WhatsappTenantConfig>('/whatsapp/config', { templateEncomenda: template }),
    onSuccess: (data) => {
      toast.success('Modelo de mensagem salvo!');
      setTemplate(data.templateEncomenda);
      queryClient.setQueryData(['whatsapp-config'], data);
    },
    onError: (e: ApiError) => toast.error(e.message || 'Falha ao salvar o modelo'),
  });

  if (configQuery.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  const cfg = configQuery.data;
  if (!cfg) return null;

  const dirty = template !== cfg.templateEncomenda;
  const intervalo = `${cfg.intervaloSegundos}s + até ${cfg.jitterSegundos}s`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelo da mensagem de encomenda</CardTitle>
        <CardDescription>
          Personalize a mensagem enviada ao morador quando uma encomenda chega. As regras de envio
          abaixo são definidas pela administração da plataforma.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0 md:pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoPill icon={Timer} label="Intervalo entre mensagens" value={intervalo} />
          <InfoPill icon={CalendarClock} label="Janela de envio" value={`${cfg.horarioEnvioInicio}–${cfg.horarioEnvioFim}`} />
          <InfoPill icon={Gauge} label="Limite diário" value={cfg.limiteDiario > 0 ? `${cfg.limiteDiario}/dia` : 'sem limite'} />
        </div>

        <TemplateEditor
          value={template}
          onChange={setTemplate}
          variaveis={cfg.variaveis}
          templatePadrao={cfg.templatePadrao}
          disabled={saveMutation.isPending}
        />

        <div className="flex justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setTemplate(cfg.templateEncomenda)} disabled={saveMutation.isPending}>
              Descartar
            </Button>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="min-h-[44px]">
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar modelo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
