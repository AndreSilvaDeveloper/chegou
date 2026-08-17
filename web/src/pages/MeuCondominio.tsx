import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Building2, CalendarDays, Car, Clock, CreditCard, DoorClosed,
  Layers, Loader2, MapPin, MessageCircle, Receipt, Save, Settings2,
  SlidersHorizontal, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, getTenantAtivo } from '@/api/client';
import type { Tenant, TenantConfig } from '@/api/types';
import { ApartamentosManager } from '@/components/ApartamentosManager';
import { MoradoresManager } from '@/components/MoradoresManager';
import { EquipeManager } from '@/components/EquipeManager';
import { AssinaturaCondominioPanel } from '@/components/condominio/AssinaturaCondominioPanel';
import { WhatsappCondominioPanel } from '@/components/condominio/WhatsappCondominioPanel';
import {
  DEFAULT_CONFIG,
  ESTRUTURA_META,
  InfoPill,
  ModuleReadonly,
  OptionCard,
  PlataformaDecide,
  TIPO_META,
  estruturaSugerida,
} from '@/components/condominio/condominio-shared';
import {
  ENDERECO_VAZIO,
  EnderecoFields,
  enderecoDoCondominio,
  enderecoParaApi,
  type EnderecoForm,
} from '@/components/condominio/EnderecoFields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DocumentoInput } from '@/components/ui/documento-input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/ui/page-shell';
import { PhoneInput } from '@/components/ui/phone-input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTrocarCondominio } from '@/hooks/use-tenant-config';
import { enderecoLinha } from '@/lib/endereco';
import { mensagemErro } from '@/lib/erros';

type Tab =
  | 'dados'
  | 'config'
  | 'apartamentos'
  | 'moradores'
  | 'equipe'
  | 'assinatura'
  | 'whatsapp';

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: 'dados', label: 'Dados gerais', icon: Building2 },
  { key: 'config', label: 'Configurações', icon: SlidersHorizontal },
  { key: 'apartamentos', label: 'Unidades', icon: DoorClosed },
  { key: 'moradores', label: 'Moradores', icon: Users },
  { key: 'equipe', label: 'Acessos', icon: Settings2 },
  { key: 'assinatura', label: 'Assinatura', icon: Receipt },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

const CADASTRO_VAZIO = {
  nome: '', documento: '', telefoneContato: '', emailContato: '',
};

/**
 * Gerenciar um condomínio da carteira — a versão da administradora do
 * `SuperAdminTenant`.
 *
 * Ela configura **o operacional**: cadastro, tipo, estrutura de blocos e janela
 * de envio. Plano, ativar/desativar e módulos contratados continuam só no
 * superadmin — aparecem aqui, mas de leitura, porque esconder faria o cliente
 * achar que o recurso não existe.
 *
 * As abas de Unidades, Moradores e Acessos reaproveitam os mesmos managers da
 * tela do superadmin, com `basePath=""`: eles caem nas rotas normais do
 * condomínio, que já resolvem o escopo pelo `X-Tenant-Id`. É por isso que abrir
 * esta tela **entra** no condomínio (veja `prontoParaCarregar` abaixo).
 */
export function MeuCondominio() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const trocarCondominio = useTrocarCondominio();
  const [tab, setTab] = useState<Tab>('dados');

  /**
   * Só monta o conteúdo depois que **este** condomínio é o ativo da sessão.
   *
   * Os managers herdam o `X-Tenant-Id` do condomínio ativo, e efeito de filho
   * roda antes do efeito do pai: renderizados junto com a troca, eles buscariam
   * dado do condomínio anterior e o mostrariam sob o nome deste.
   */
  const [prontoParaCarregar, setProntoParaCarregar] = useState(() => getTenantAtivo() === id);

  useEffect(() => {
    if (!id) return;
    if (getTenantAtivo() !== id) trocarCondominio(id);
    setProntoParaCarregar(true);
    // `trocarCondominio` é recriado a cada render; depender dele daria laço.
  }, [id]);

  const condominioQuery = useQuery({
    queryKey: ['minha-administradora', 'condominios', id],
    queryFn: () => api.get<Tenant>(`/minha-administradora/condominios/${id}`),
    enabled: prontoParaCarregar && !!id,
  });

  const condominio = condominioQuery.data;

  const [cadastro, setCadastro] = useState(CADASTRO_VAZIO);
  const [endereco, setEndereco] = useState<EnderecoForm>(ENDERECO_VAZIO);
  const [config, setConfig] = useState<Required<TenantConfig>>(DEFAULT_CONFIG);

  // O formulário nasce do que veio do servidor, e é recarregado a cada resposta
  // nova — inclusive depois de salvar, para a tela mostrar o que ficou gravado.
  useEffect(() => {
    if (!condominio) return;
    setCadastro({
      nome: condominio.nome,
      documento: condominio.documento ?? '',
      telefoneContato: condominio.telefoneContato ?? '',
      emailContato: condominio.emailContato ?? '',
    });
    setEndereco(enderecoDoCondominio(condominio));
    setConfig({ ...DEFAULT_CONFIG, ...(condominio.configJson ?? {}) });
  }, [condominio]);

  const salvar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) =>
      api.patch<Tenant>(`/minha-administradora/condominios/${id}`, corpo),
    onSuccess: () => {
      toast.success('Condomínio atualizado.');
      queryClient.invalidateQueries({ queryKey: ['minha-administradora'] });
      // O tipo e a estrutura de blocos mudam telas do condomínio inteiro.
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (err: unknown) => toast.error(mensagemErro(err, 'Não foi possível salvar')),
  });

  const salvarCadastro = (e: FormEvent) => {
    e.preventDefault();
    if (!cadastro.nome.trim()) return toast.error('Informe o nome do condomínio');
    salvar.mutate({
      nome: cadastro.nome.trim(),
      // Campo vazio some do corpo: mandar string vazia num CNPJ reprovaria no
      // formato, e o DTO trata ausência como "não mexi nisso".
      documento: cadastro.documento.trim() || undefined,
      // O endereço vai por inteiro, inclusive campo vazio: o DTO converte vazio
      // em NULL, e é assim que dá para apagar um complemento errado.
      ...enderecoParaApi(endereco),
      telefoneContato: cadastro.telefoneContato || undefined,
      emailContato: cadastro.emailContato.trim() || undefined,
    });
  };

  const salvarConfig = (e: FormEvent) => {
    e.preventDefault();
    // Só o operacional: módulos e plano não saem daqui nem por engano — a rota
    // recusaria com 400, e mandar seria pedir erro para o usuário ler.
    salvar.mutate({
      configJson: {
        tipo: config.tipo,
        estruturaBlocos: config.estruturaBlocos,
        horarioEnvioInicio: config.horarioEnvioInicio,
        horarioEnvioFim: config.horarioEnvioFim,
      },
    });
  };

  if (condominioQuery.isLoading || !prontoParaCarregar) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (condominioQuery.isError || !condominio) {
    return (
      <Card>
        <CardContent className="space-y-4 py-12 text-center">
          <p className="txt-subtitulo font-semibold text-foreground">Condomínio não encontrado</p>
          <p className="txt-apoio text-muted-foreground">
            Ele pode ter saído da sua carteira. Volte e escolha outro.
          </p>
          <Link to="/meus-condominios">
            <Button >Voltar para a carteira</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const TipoIcon = TIPO_META[config.tipo].icon;
  const EstruturaIcon = ESTRUTURA_META[config.estruturaBlocos].icon;
  const criadoEm = new Date(condominio.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <PageShell
      icon={Building2}
      eyebrow="Carteira"
      title="Configurar condomínio"
      description="Você está operando neste condomínio enquanto esta tela estiver aberta."
      voltar="/meus-condominios"
    >
      <div className="space-y-6">
      <Card className="overflow-hidden border-primary/10">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <TipoIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate txt-titulo font-bold tracking-tight text-foreground">
                {condominio.nome}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={condominio.ativo ? 'success' : 'secondary'}>
                  {condominio.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
                <Badge variant="outline" className="gap-1 font-normal">
                  <TipoIcon className="h-3 w-3" />
                  {TIPO_META[config.tipo].label}
                </Badge>
                <Badge variant="outline" className="gap-1 font-normal">
                  <EstruturaIcon className="h-3 w-3" />
                  {ESTRUTURA_META[config.estruturaBlocos].label}
                </Badge>
                <Badge variant="outline" className="font-mono text-muted-foreground">
                  {condominio.slug}
                </Badge>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoPill icon={CreditCard} label="Plano" value={condominio.plano || '—'} />
            <InfoPill
              icon={MapPin}
              label="Endereço"
              value={enderecoLinha(condominio) || '—'}
            />
            <InfoPill icon={CalendarDays} label="Criado em" value={criadoEm} />
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-6">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              <t.icon />
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Dados gerais */}
        <TabsContent value="dados" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Informações do condomínio
              </CardTitle>
              <CardDescription>Os dados de identificação e contato deste condomínio.</CardDescription>
            </CardHeader>
            <form onSubmit={salvarCadastro}>
              <CardContent className="space-y-6 pt-0 md:pt-0">
                <div className="space-y-2">
                  <Label htmlFor="cond-nome">Nome do condomínio *</Label>
                  <Input
                    id="cond-nome"
                    value={cadastro.nome}
                    onChange={(e) => setCadastro({ ...cadastro, nome: e.target.value })}
                    required
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cond-documento">CPF ou CNPJ</Label>
                    <DocumentoInput
                      id="cond-documento"
                      value={cadastro.documento}
                      onChange={(documento) => setCadastro({ ...cadastro, documento })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cond-email">E-mail de contato</Label>
                    <Input
                      id="cond-email"
                      type="email"
                      value={cadastro.emailContato}
                      onChange={(e) => setCadastro({ ...cadastro, emailContato: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="cond-telefone">Telefone de contato</Label>
                  <PhoneInput
                    id="cond-telefone"
                    value={cadastro.telefoneContato}
                    onChange={(e164) => setCadastro({ ...cadastro, telefoneContato: e164 })}
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Endereço</h3>
                    <p className="txt-apoio text-muted-foreground">
                      Digite o CEP e o resto é preenchido sozinho.
                    </p>
                  </div>
                  <EnderecoFields valor={endereco} onChange={setEndereco} />
                </div>

                <PlataformaDecide texto="O plano da assinatura e o acesso do condomínio (ativo ou inativo) são definidos pelo Chegou. Precisa mudar? Fale com o suporte." />
              </CardContent>
              <CardFooter className="flex justify-end bg-muted/50 py-4">
                <Button type="submit" disabled={salvar.isPending} >
                  {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar alterações
                </Button>
              </CardFooter>
            </form>
          </Card>
        </TabsContent>

        {/* Configurações */}
        <TabsContent value="config" className="mt-0">
          <form onSubmit={salvarConfig}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-primary" /> Configurações do condomínio
                </CardTitle>
                <CardDescription>
                  Definem como o sistema se comporta neste condomínio — cadastros e envios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-0 md:pt-0">
                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Tipo de condomínio</h3>
                    <p className="txt-apoio text-muted-foreground">
                      Define a nomenclatura das unidades e os recursos disponíveis.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(['residencial', 'comercial', 'misto'] as const).map((tipo) => (
                      <OptionCard
                        key={tipo}
                        active={config.tipo === tipo}
                        onClick={() => setConfig({ ...config, tipo, estruturaBlocos: estruturaSugerida(tipo) })}
                        icon={TIPO_META[tipo].icon}
                        title={TIPO_META[tipo].label}
                        description={
                          tipo === 'residencial'
                            ? 'Prédio ou casas de moradia.'
                            : tipo === 'comercial'
                              ? 'Salas, lojas e escritórios.'
                              : 'Residencial e comercial juntos.'
                        }
                      />
                    ))}
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Estrutura de blocos</h3>
                    <p className="txt-apoio text-muted-foreground">
                      Controla se o cadastro de unidades pede a identificação do bloco.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <OptionCard
                      active={config.estruturaBlocos === 'unico'}
                      onClick={() => setConfig({ ...config, estruturaBlocos: 'unico' })}
                      icon={Building2}
                      title="Bloco único"
                      description="Um único prédio ou torre."
                    />
                    <OptionCard
                      active={config.estruturaBlocos === 'multiplos'}
                      onClick={() => setConfig({ ...config, estruturaBlocos: 'multiplos' })}
                      icon={Layers}
                      title="Múltiplos blocos"
                      description="Vários blocos, torres ou alas."
                    />
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <h3 className="flex items-center gap-2 txt-subtitulo font-semibold text-foreground">
                      <Clock className="h-4 w-4 text-primary" /> Janela de envio no WhatsApp
                    </h3>
                    <p className="txt-apoio text-muted-foreground">
                      Notificações só saem dentro deste horário. Dá para estreitar, mas não para
                      passar de 08:00–21:00 — enviar de madrugada é o que derruba o número do
                      condomínio.
                    </p>
                  </div>
                  <div className="grid max-w-md gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="envio-inicio">Início</Label>
                      <Input
                        id="envio-inicio"
                        type="time"
                        min="08:00"
                        max="21:00"
                        value={config.horarioEnvioInicio}
                        onChange={(e) => setConfig({ ...config, horarioEnvioInicio: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="envio-fim">Fim</Label>
                      <Input
                        id="envio-fim"
                        type="time"
                        min="08:00"
                        max="21:00"
                        value={config.horarioEnvioFim}
                        onChange={(e) => setConfig({ ...config, horarioEnvioFim: e.target.value })}
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Módulos contratados</h3>
                    <p className="txt-apoio text-muted-foreground">
                      Fazem parte do contrato do condomínio com o Chegou, por isso são ligados pela
                      plataforma.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <ModuleReadonly
                      icon={Car}
                      title="Vagas de garagem"
                      description="Gestão de vagas e locação avulsa."
                      checked={config.moduloVagas}
                    />
                    <ModuleReadonly
                      icon={Bell}
                      title="Mural de avisos"
                      description="Comunicados gerais para os moradores."
                      checked={config.moduloAvisos}
                    />
                  </div>
                </section>
              </CardContent>
              <CardFooter className="flex justify-end bg-muted/50 py-4">
                <Button type="submit" disabled={salvar.isPending} >
                  {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar configurações
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="apartamentos" className="mt-0">
          <ApartamentosManager basePath="" embutido />
        </TabsContent>

        <TabsContent value="moradores" className="mt-0">
          <MoradoresManager basePath="" embutido />
        </TabsContent>

        <TabsContent value="equipe" className="mt-0">
          <EquipeManager basePath="" allowedRoles={['porteiro', 'sindico']} embutido />
        </TabsContent>

        {/* Assinatura em leitura: quem paga por este condomínio é a carteira
            dela, e é lá (`/assinatura`) que a fatura é operada. Aqui ela vê
            quanto este condomínio pesa e o que já foi cobrado. */}
        <TabsContent value="assinatura" className="mt-0">
          <AssinaturaCondominioPanel tenantId={id!} podeEditar={false} />
        </TabsContent>

        {/* WhatsApp editável: é operacional do condomínio, o mesmo que ela já
            fazia em `/whatsapp` depois de entrar nele. `basePath=""` porque
            esta tela entra no condomínio (veja `prontoParaCarregar`). */}
        <TabsContent value="whatsapp" className="mt-0">
          <WhatsappCondominioPanel basePath="" />
        </TabsContent>
      </Tabs>
      </div>
    </PageShell>
  );
}
