import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Building2, CalendarDays, Car, Clock, CreditCard, Layers, Loader2,
  MapPin, MessageCircle, Save, SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/client';
import type { Tenant, TenantConfig } from '@/api/types';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentoInput } from '@/components/ui/documento-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/ui/page-shell';
import { PhoneInput } from '@/components/ui/phone-input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mensagemErro } from '@/lib/erros';

type Tab = 'dados' | 'config';

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: 'dados', label: 'Dados gerais', icon: Building2 },
  { key: 'config', label: 'Configurações', icon: SlidersHorizontal },
];

const CADASTRO_VAZIO = {
  nome: '', documento: '', cidade: '', estado: '', endereco: '', telefoneContato: '', emailContato: '',
};

/**
 * Configurações do próprio condomínio — a versão do **síndico** do
 * `SuperAdminTenant`.
 *
 * Ela tem as mesmas duas primeiras abas das telas do superadmin e da
 * administradora, e o mesmo recorte de poder da administradora: o síndico
 * edita **o que descreve o condomínio** (cadastro, tipo e estrutura de blocos).
 * Plano, ativo e módulos contratados descrevem o *contrato* e aparecem de
 * leitura, com o motivo.
 *
 * Duas coisas que esta tela **não** tem, de propósito:
 *
 * - **Unidades, Moradores, Equipe, Assinatura e WhatsApp.** Lá elas são abas
 *   porque o superadmin e a administradora entram num condomínio que não é o
 *   deles; o síndico já tem cada uma dessas no menu.
 * - **A janela de envio.** Ela vive em `/whatsapp`, junto do ritmo e das travas
 *   anti-bloqueio, que é onde o síndico enxerga quantas mensagens cabem no dia.
 *   Dois editores para o mesmo campo divergiriam — e este seria o sem trava.
 *
 * Não existe `:id` na rota: o condomínio vem do vínculo do usuário, resolvido
 * pelo `TenantScopeGuard` no backend.
 */
export function ConfiguracoesCondominio() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('dados');

  const condominioQuery = useQuery({
    queryKey: ['meu-condominio'],
    queryFn: () => api.get<Tenant>('/meu-condominio'),
  });

  const condominio = condominioQuery.data;

  const [cadastro, setCadastro] = useState(CADASTRO_VAZIO);
  const [config, setConfig] = useState<Required<TenantConfig>>(DEFAULT_CONFIG);

  // O formulário nasce do que veio do servidor, e é recarregado a cada resposta
  // nova — inclusive depois de salvar, para a tela mostrar o que ficou gravado.
  useEffect(() => {
    if (!condominio) return;
    setCadastro({
      nome: condominio.nome,
      documento: condominio.documento ?? '',
      cidade: condominio.cidade ?? '',
      estado: condominio.estado ?? '',
      endereco: condominio.endereco ?? '',
      telefoneContato: condominio.telefoneContato ?? '',
      emailContato: condominio.emailContato ?? '',
    });
    setConfig({ ...DEFAULT_CONFIG, ...(condominio.configJson ?? {}) });
  }, [condominio]);

  const salvar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => api.patch<Tenant>('/meu-condominio', corpo),
    onSuccess: () => {
      toast.success('Condomínio atualizado.');
      queryClient.invalidateQueries({ queryKey: ['meu-condominio'] });
      // O tipo e a estrutura de blocos mudam telas do condomínio inteiro (o
      // cadastro de unidade passa a pedir bloco, ou deixa de pedir).
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
      cidade: cadastro.cidade.trim() || undefined,
      estado: cadastro.estado.trim().toUpperCase() || undefined,
      endereco: cadastro.endereco.trim() || undefined,
      telefoneContato: cadastro.telefoneContato || undefined,
      emailContato: cadastro.emailContato.trim() || undefined,
    });
  };

  const salvarConfig = (e: FormEvent) => {
    e.preventDefault();
    // Só o que descreve o condomínio. Módulos, plano e a janela de envio não
    // saem daqui nem por engano: a rota recusaria com 400, e mandar seria pedir
    // um erro para o usuário ler.
    salvar.mutate({
      configJson: { tipo: config.tipo, estruturaBlocos: config.estruturaBlocos },
    });
  };

  if (condominioQuery.isLoading) {
    return (
      <PageShell icon={SlidersHorizontal} eyebrow="Condomínio" title="Configurações">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </PageShell>
    );
  }

  if (condominioQuery.isError || !condominio) {
    return (
      <PageShell icon={SlidersHorizontal} eyebrow="Condomínio" title="Configurações">
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <p className="txt-subtitulo font-semibold text-foreground">
              Não foi possível carregar o condomínio
            </p>
            <p className="txt-apoio text-muted-foreground">
              Tente de novo em alguns instantes. Se continuar, fale com o suporte.
            </p>
            <Button onClick={() => condominioQuery.refetch()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const TipoIcon = TIPO_META[config.tipo].icon;
  const EstruturaIcon = ESTRUTURA_META[config.estruturaBlocos].icon;
  const criadoEm = new Date(condominio.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <PageShell
      icon={SlidersHorizontal}
      eyebrow="Condomínio"
      title="Configurações"
      description="Os dados do condomínio e como o sistema se comporta nele."
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
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <InfoPill icon={CreditCard} label="Plano" value={condominio.plano || '—'} />
              <InfoPill
                icon={MapPin}
                label="Localização"
                value={[condominio.cidade, condominio.estado].filter(Boolean).join(' / ') || '—'}
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
                <CardDescription>Os dados de identificação e contato do condomínio.</CardDescription>
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

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cond-cidade">Cidade</Label>
                      <Input
                        id="cond-cidade"
                        value={cadastro.cidade}
                        onChange={(e) => setCadastro({ ...cadastro, cidade: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cond-uf">Estado (UF)</Label>
                      <Input
                        id="cond-uf"
                        className="uppercase"
                        placeholder="SP"
                        value={cadastro.estado}
                        onChange={(e) =>
                          setCadastro({ ...cadastro, estado: e.target.value.toUpperCase().slice(0, 2) })
                        }
                        maxLength={2}
                      />
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cond-endereco">Endereço</Label>
                      <Input
                        id="cond-endereco"
                        value={cadastro.endereco}
                        onChange={(e) => setCadastro({ ...cadastro, endereco: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cond-telefone">Telefone de contato</Label>
                      <PhoneInput
                        id="cond-telefone"
                        value={cadastro.telefoneContato}
                        onChange={(e164) => setCadastro({ ...cadastro, telefoneContato: e164 })}
                      />
                    </div>
                  </div>

                  <PlataformaDecide texto="O plano da assinatura e o acesso do condomínio (ativo ou inativo) são definidos pelo Chegou. Precisa mudar? Fale com o suporte." />
                </CardContent>
                <CardFooter className="flex justify-end bg-muted/50 py-4">
                  <Button type="submit" disabled={salvar.isPending}>
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
                    Definem como o sistema se comporta — a nomenclatura das unidades e o que o
                    cadastro pede.
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
                          onClick={() =>
                            setConfig({ ...config, tipo, estruturaBlocos: estruturaSugerida(tipo) })
                          }
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

                  {/* A janela de envio mora em /whatsapp, com o ritmo e as travas
                      anti-bloqueio. Aqui ela é só um atalho: dois editores para o
                      mesmo campo é como as duas telas divergem. */}
                  <section className="space-y-3">
                    <div>
                      <h3 className="flex items-center gap-2 txt-subtitulo font-semibold text-foreground">
                        <Clock className="h-4 w-4 text-primary" /> Janela de envio no WhatsApp
                      </h3>
                      <p className="txt-apoio text-muted-foreground">
                        Hoje as notificações saem entre {config.horarioEnvioInicio} e{' '}
                        {config.horarioEnvioFim}. O horário e o ritmo dos envios ficam na tela de
                        WhatsApp, junto do limite diário.
                      </p>
                    </div>
                    <Button type="button" variant="outline" asChild>
                      <Link to="/whatsapp">
                        <MessageCircle className="mr-2 h-4 w-4" />
                        Ajustar em WhatsApp
                      </Link>
                    </Button>
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
                  <Button type="submit" disabled={salvar.isPending}>
                    {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar configurações
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
