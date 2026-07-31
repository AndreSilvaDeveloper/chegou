import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import { WhatsappTenantConfig } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { TemplateEditor } from '@/components/whatsapp/TemplateEditor';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';

/** Diz de olho se aquele texto é o do sistema ou um escrito pelo condomínio. */
function OrigemBadge({ personalizado }: { personalizado: boolean }) {
  return (
    <Badge variant={personalizado ? 'success' : 'outline'}>
      {personalizado ? 'Personalizada' : 'Modelo padrão'}
    </Badge>
  );
}

/** Ver `WhatsappConnectionCard` para o que `basePath` significa. */
export function WhatsappTemplateCard({ basePath = '' }: { basePath?: string }) {
  const queryClient = useQueryClient();
  const chaveConfig = ['whatsapp-config', basePath];
  const [chegada, setChegada] = useState('');
  const [retirada, setRetirada] = useState('');
  // Só relê do servidor quando os textos mudaram lá: salvar o card de regras
  // atualiza a mesma query e apagaria o que estivesse sendo escrito aqui.
  const sincronizado = useRef<string | null>(null);

  const configQuery = useQuery({
    queryKey: chaveConfig,
    queryFn: () => api.get<WhatsappTenantConfig>(`${basePath}/whatsapp/config`),
  });

  // O campo já abre com o texto que o morador recebe hoje — do condomínio, se
  // ele personalizou; do sistema, se não. Campo vazio esconderia a mensagem
  // real e obrigaria a escrever do zero para mudar uma palavra.
  useEffect(() => {
    const cfg = configQuery.data;
    if (!cfg) return;
    const doServidor = [
      cfg.templateEncomenda || cfg.templatePadrao,
      cfg.templateRetirada || cfg.templatePadraoRetirada,
    ];
    const assinatura = JSON.stringify(doServidor);
    if (sincronizado.current === assinatura) return;
    sincronizado.current = assinatura;
    setChegada(doServidor[0]);
    setRetirada(doServidor[1]);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: { templateEncomenda?: string; templateRetirada?: string }) =>
      api.patch<WhatsappTenantConfig>(`${basePath}/whatsapp/config`, payload),
    onSuccess: (data) => {
      toast.success('Modelos de mensagem salvos!');
      queryClient.setQueryData(chaveConfig, data);
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível salvar os modelos')),
  });

  if (configQuery.isLoading) return <Skeleton className="h-[40rem] w-full rounded-2xl" />;
  const cfg = configQuery.data;
  if (!cfg) return null;

  const efetivoChegada = cfg.templateEncomenda || cfg.templatePadrao;
  const efetivoRetirada = cfg.templateRetirada || cfg.templatePadraoRetirada;
  const chegadaMudou = chegada !== efetivoChegada;
  const retiradaMudou = retirada !== efetivoRetirada;
  const dirty = chegadaMudou || retiradaMudou;

  const descartar = () => {
    setChegada(efetivoChegada);
    setRetirada(efetivoRetirada);
  };

  // Manda só o que mudou: assim um condomínio que ajustou apenas a retirada
  // continua acompanhando o modelo padrão de chegada quando ele melhorar.
  const salvar = () => {
    const payload: { templateEncomenda?: string; templateRetirada?: string } = {};
    if (chegadaMudou) payload.templateEncomenda = chegada;
    if (retiradaMudou) payload.templateRetirada = retirada;
    saveMutation.mutate(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelos de mensagem</CardTitle>
        <CardDescription>
          Personalize o que o morador recebe quando a encomenda chega e quando ele a retira.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-0 md:pt-0">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="txt-subtitulo font-semibold text-foreground">1. Quando a encomenda chega</h3>
            <OrigemBadge personalizado={Boolean(cfg.templateEncomenda)} />
          </div>
          <TemplateEditor
            id="template-encomenda"
            titulo="Mensagem de chegada"
            ajuda="Enviada assim que o porteiro registra a encomenda na portaria."
            value={chegada}
            onChange={setChegada}
            variaveis={cfg.variaveis}
            templatePadrao={cfg.templatePadrao}
            disabled={saveMutation.isPending}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="txt-subtitulo font-semibold text-foreground">2. Quando a encomenda é retirada</h3>
            <OrigemBadge personalizado={Boolean(cfg.templateRetirada)} />
          </div>
          <TemplateEditor
            id="template-retirada"
            titulo="Mensagem de retirada"
            ajuda="Enviada como confirmação depois que o morador retira a encomenda."
            value={retirada}
            onChange={setRetirada}
            variaveis={cfg.variaveisRetirada}
            templatePadrao={cfg.templatePadraoRetirada}
            disabled={saveMutation.isPending}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {dirty && (
            <Button
              variant="ghost"
              onClick={descartar}
              disabled={saveMutation.isPending}
              className="w-full sm:w-auto"
            >
              Descartar alterações
            </Button>
          )}
          <Button
            onClick={salvar}
            disabled={!dirty || saveMutation.isPending}
            className="w-full sm:w-auto"
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar modelos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
