import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { WhatsappTenantConfig } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';

interface Form {
  intervaloSegundos: number;
  horarioEnvioInicio: string;
  horarioEnvioFim: string;
  limiteDiario: number;
}

/**
 * Ritmo de envio do WhatsApp do condomínio, editável pelo síndico.
 *
 * As faixas permitidas vêm do backend (`cfg.limites`) — não são repetidas aqui
 * para a tela não divergir da validação. Elas existem por causa das regras
 * anti-bloqueio: mensagem rápida demais, de madrugada ou em volume alto é o que
 * derruba o número do condomínio.
 */
export function WhatsappEnvioCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  // Guarda a última versão do servidor já aplicada no formulário: salvar o card
  // dos modelos atualiza a mesma query, e sem isto o que estivesse sendo
  // digitado aqui seria descartado.
  const sincronizado = useRef<string | null>(null);

  const configQuery = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => api.get<WhatsappTenantConfig>('/whatsapp/config'),
  });

  useEffect(() => {
    const cfg = configQuery.data;
    if (!cfg) return;
    const doServidor: Form = {
      intervaloSegundos: cfg.intervaloSegundos,
      horarioEnvioInicio: cfg.horarioEnvioInicio,
      horarioEnvioFim: cfg.horarioEnvioFim,
      limiteDiario: cfg.limiteDiario,
    };
    const assinatura = JSON.stringify(doServidor);
    if (sincronizado.current === assinatura) return;
    sincronizado.current = assinatura;
    setForm(doServidor);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Form) => api.patch<WhatsappTenantConfig>('/whatsapp/config', payload),
    onSuccess: (data) => {
      toast.success('Regras de envio salvas!');
      queryClient.setQueryData(['whatsapp-config'], data);
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível salvar as regras')),
  });

  if (configQuery.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  const cfg = configQuery.data;
  if (!cfg || !form) return null;

  const { limites } = cfg;
  const dirty =
    form.intervaloSegundos !== cfg.intervaloSegundos ||
    form.horarioEnvioInicio !== cfg.horarioEnvioInicio ||
    form.horarioEnvioFim !== cfg.horarioEnvioFim ||
    form.limiteDiario !== cfg.limiteDiario;

  // Erros conferidos antes de enviar, para o síndico ver o problema no campo e
  // não num toast depois do 400.
  const erros = {
    intervalo:
      form.intervaloSegundos < limites.intervaloMinimoSegundos
        ? `Mínimo de ${limites.intervaloMinimoSegundos} segundos`
        : null,
    janela:
      form.horarioEnvioInicio < limites.janelaMinima || form.horarioEnvioFim > limites.janelaMaxima
        ? `Precisa ficar entre ${limites.janelaMinima} e ${limites.janelaMaxima}`
        : form.horarioEnvioInicio >= form.horarioEnvioFim
          ? 'O início precisa ser antes do término'
          : null,
    limite:
      form.limiteDiario < limites.limiteDiarioMinimo || form.limiteDiario > limites.limiteDiarioMaximo
        ? `Entre ${limites.limiteDiarioMinimo} e ${limites.limiteDiarioMaximo} por dia`
        : null,
  };
  const temErro = Object.values(erros).some(Boolean);

  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras de envio</CardTitle>
        <CardDescription>
          Controle o ritmo das mensagens do seu condomínio. Os limites abaixo protegem o número
          contra bloqueio pelo WhatsApp — dentro deles, você escolhe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0 md:pt-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="intervalo" className="text-base">Espera entre mensagens</Label>
            <div className="flex items-center gap-2">
              <Input
                id="intervalo"
                type="number"
                inputMode="numeric"
                min={limites.intervaloMinimoSegundos}
                max={3600}
                step={10}
                value={form.intervaloSegundos}
                onChange={(e) => setForm({ ...form, intervaloSegundos: num(e.target.value, cfg.intervaloSegundos) })}
                disabled={saveMutation.isPending}
                className="min-h-[48px] max-w-[10rem] text-base"
              />
              <span className="text-base text-muted-foreground">segundos</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo de {limites.intervaloMinimoSegundos}s. Aumentar deixa o envio mais lento e mais
              seguro; o sistema ainda soma até {cfg.jitterSegundos}s aleatórios a cada mensagem.
            </p>
            {erros.intervalo && <p className="text-sm font-medium text-destructive">{erros.intervalo}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="limite" className="text-base">Limite por dia</Label>
            <div className="flex items-center gap-2">
              <Input
                id="limite"
                type="number"
                inputMode="numeric"
                min={limites.limiteDiarioMinimo}
                max={limites.limiteDiarioMaximo}
                step={10}
                value={form.limiteDiario}
                onChange={(e) => setForm({ ...form, limiteDiario: num(e.target.value, cfg.limiteDiario) })}
                disabled={saveMutation.isPending}
                className="min-h-[48px] max-w-[10rem] text-base"
              />
              <span className="text-base text-muted-foreground">mensagens</span>
            </div>
            <p className="text-xs text-muted-foreground">
              De {limites.limiteDiarioMinimo} a {limites.limiteDiarioMaximo} por dia. O que passar
              disso é enviado no dia seguinte, não se perde.
            </p>
            {erros.limite && <p className="text-sm font-medium text-destructive">{erros.limite}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inicio" className="text-base">Enviar a partir de</Label>
            <Input
              id="inicio"
              type="time"
              min={limites.janelaMinima}
              max={limites.janelaMaxima}
              value={form.horarioEnvioInicio}
              onChange={(e) => setForm({ ...form, horarioEnvioInicio: e.target.value })}
              disabled={saveMutation.isPending}
              className="min-h-[48px] max-w-[10rem] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fim" className="text-base">Enviar até</Label>
            <Input
              id="fim"
              type="time"
              min={limites.janelaMinima}
              max={limites.janelaMaxima}
              value={form.horarioEnvioFim}
              onChange={(e) => setForm({ ...form, horarioEnvioFim: e.target.value })}
              disabled={saveMutation.isPending}
              className="min-h-[48px] max-w-[10rem] text-base"
            />
            <p className="text-xs text-muted-foreground">
              A janela precisa ficar entre {limites.janelaMinima} e {limites.janelaMaxima}. Fora
              dela, a mensagem espera a próxima abertura.
            </p>
            {erros.janela && <p className="text-sm font-medium text-destructive">{erros.janela}</p>}
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Com {form.intervaloSegundos}s de espera e a janela de {form.horarioEnvioInicio} às{' '}
            {form.horarioEnvioFim}, cabem cerca de{' '}
            <b className="text-foreground">{estimativaPorDia(form)}</b> mensagens por dia.
          </span>
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => setForm({
                intervaloSegundos: cfg.intervaloSegundos,
                horarioEnvioInicio: cfg.horarioEnvioInicio,
                horarioEnvioFim: cfg.horarioEnvioFim,
                limiteDiario: cfg.limiteDiario,
              })}
              disabled={saveMutation.isPending}
              className="min-h-[48px] w-full sm:w-auto"
            >
              Descartar alterações
            </Button>
          )}
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={!dirty || temErro || saveMutation.isPending}
            className="min-h-[48px] w-full sm:w-auto"
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar regras
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Quantas mensagens cabem na janela, no ritmo escolhido (aproximado). */
function estimativaPorDia({ intervaloSegundos, horarioEnvioInicio, horarioEnvioFim, limiteDiario }: Form): number {
  const minutos = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  const janelaSegundos = Math.max(0, minutos(horarioEnvioFim) - minutos(horarioEnvioInicio)) * 60;
  const cabem = intervaloSegundos > 0 ? Math.floor(janelaSegundos / intervaloSegundos) : 0;
  return Math.min(cabem, limiteDiario);
}
