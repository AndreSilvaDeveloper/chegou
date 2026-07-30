import { FormEvent, useEffect, useState, ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Tenant, TenantConfig } from '../api/types';
import {
  DEFAULT_CONFIG,
  InfoPill,
  ModuleToggle,
  OptionCard,
  TIPO_META,
  estruturaSugerida,
} from '@/components/condominio/condominio-shared';
import { AssinaturaCondominioPanel } from '@/components/condominio/AssinaturaCondominioPanel';
import { WhatsappCondominioPanel } from '@/components/condominio/WhatsappCondominioPanel';
import { ApartamentosManager } from '../components/ApartamentosManager';
import { MoradoresManager } from '../components/MoradoresManager';
import { EquipeManager } from '../components/EquipeManager';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft, Building2, Store, Blend, Home, Layers, Loader2, MapPin, CreditCard,
  CalendarDays, Users, DoorClosed, Settings2, SlidersHorizontal, Save, Car, Bell,
  Clock, Power, Receipt, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab =
  | 'dados'
  | 'config'
  | 'apartamentos'
  | 'moradores'
  | 'equipe'
  | 'assinatura'
  | 'whatsapp';

export function SuperAdminTenant() {
  const { id } = useParams<{ id: string }>();
  const base = `/admin/tenants/${id}`;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>('dados');

  const [form, setForm] = useState({
    nome: '', slug: '', cnpj: '', cidade: '', estado: '', plano: '', ativo: true,
  });
  const [config, setConfig] = useState<Required<TenantConfig>>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = () =>
    api.get<Tenant>(`/admin/tenants/${id}`).then((t) => {
      setTenant(t);
      setForm({
        nome: t.nome, slug: t.slug, cnpj: t.cnpj ?? '', cidade: t.cidade ?? '',
        estado: t.estado ?? '', plano: t.plano, ativo: t.ativo,
      });
      setConfig({ ...DEFAULT_CONFIG, ...(t.configJson ?? {}) });
    }).catch(() => toast.error('Condomínio não encontrado'));

  useEffect(() => { load(); }, [id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/admin/tenants/${id}`, {
        nome: form.nome,
        slug: form.slug,
        cnpj: form.cnpj || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        plano: form.plano,
        ativo: form.ativo,
      });
      toast.success('Dados salvos com sucesso!');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar condomínio');
    } finally {
      setSaving(false);
    }
  };

  const escolherTipo = (tipo: Required<TenantConfig>['tipo']) => {
    setConfig({ ...config, tipo, estruturaBlocos: estruturaSugerida(tipo) });
  };

  const salvarConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.patch(`/admin/tenants/${id}`, { configJson: config });
      toast.success('Configurações atualizadas!');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!tenant) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Carregando informações...</p>
        </div>
      </div>
    );
  }

  const TipoIcon = TIPO_META[config.tipo].icon;
  const criadoEm = new Date(tenant.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const tabs: { key: Tab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'dados', label: 'Dados Gerais', icon: Building2 },
    { key: 'config', label: 'Configurações', icon: SlidersHorizontal },
    { key: 'apartamentos', label: 'Unidades', icon: DoorClosed },
    { key: 'moradores', label: 'Moradores', icon: Users },
    { key: 'equipe', label: 'Equipe', icon: Settings2 },
    { key: 'assinatura', label: 'Assinatura', icon: Receipt },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Voltar */}
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="icon" className="rounded-full" type="button" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader
          title="Gerenciar Condomínio"
          description="Administre os dados, configurações e cadastros deste ambiente."
          className="mb-0 border-0 pb-0"
        />
      </div>

      {/* Hero header */}
      <Card className="overflow-hidden border-primary/10">
        <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <TipoIcon className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate txt-titulo font-bold tracking-tight text-foreground">
                  {tenant.nome}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={tenant.ativo ? 'success' : 'secondary'}>
                    {tenant.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Badge variant="outline" className="gap-1 font-normal">
                    <TipoIcon className="h-3 w-3" />
                    {TIPO_META[config.tipo].label}
                  </Badge>
                  <Badge variant="outline" className="gap-1 font-normal">
                    <Layers className="h-3 w-3" />
                    {config.estruturaBlocos === 'multiplos' ? 'Múltiplos blocos' : 'Bloco único'}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-muted-foreground">{tenant.slug}</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <InfoPill icon={CreditCard} label="Plano" value={tenant.plano || '—'} />
            <InfoPill icon={MapPin} label="Localização" value={[tenant.cidade, tenant.estado].filter(Boolean).join(' / ') || '—'} />
            <InfoPill icon={CalendarDays} label="Criado em" value={criadoEm} />
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-6">
        {/* Sete abas: no celular ficam 2 por linha (o alvo de toque não pode
            encolher), no desktop cabem todas numa fita só. */}
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-card p-1 shadow-xs sm:grid-cols-4 lg:grid-cols-7">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="flex items-center justify-center gap-2 rounded-lg py-2.5 txt-corpo data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Dados Gerais */}
        <TabsContent value="dados" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Informações do Condomínio
              </CardTitle>
              <CardDescription>Atualize os dados básicos de identificação deste ambiente.</CardDescription>
            </CardHeader>
            <form onSubmit={salvar}>
              <CardContent className="space-y-6 pt-0 md:pt-0">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome do Condomínio *</Label>
                    <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <Input id="slug" className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input id="cnpj" className="font-mono" placeholder="Apenas números" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value.replace(/\D/g, '') })} maxLength={14} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plano">Plano da Assinatura</Label>
                    <Input id="plano" value={form.plano} onChange={(e) => setForm({ ...form, plano: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="cidade" className="pl-9" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado (UF)</Label>
                    <Input id="estado" className="uppercase" placeholder="SP" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
                  </div>
                </div>

                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={form.ativo}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                    />
                    <div>
                      <p className="font-medium text-destructive">Permitir Acesso (Condomínio Ativo)</p>
                      <p className="txt-corpo text-destructive/80 mt-1">Se você desmarcar esta opção, TODOS os usuários deste condomínio perderão acesso imediato ao sistema.</p>
                    </div>
                  </label>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar Alterações
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
                  <SlidersHorizontal className="h-5 w-5 text-primary" /> Configurações do Condomínio
                </CardTitle>
                <CardDescription>
                  Definem como o sistema se comporta em todo o app — cadastros, módulos e envios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-0 md:pt-0">
                {/* Tipo */}
                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Tipo de condomínio</h3>
                    <p className="txt-apoio text-muted-foreground">Define a nomenclatura das unidades e os recursos disponíveis.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <OptionCard active={config.tipo === 'residencial'} onClick={() => escolherTipo('residencial')} icon={Home} title="Residencial" description="Prédio ou casas de moradia." />
                    <OptionCard active={config.tipo === 'comercial'} onClick={() => escolherTipo('comercial')} icon={Store} title="Comercial" description="Salas, lojas e escritórios." />
                    <OptionCard active={config.tipo === 'misto'} onClick={() => escolherTipo('misto')} icon={Blend} title="Misto" description="Residencial e comercial juntos." />
                  </div>
                </section>

                <Separator />

                {/* Estrutura de blocos */}
                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Estrutura de blocos</h3>
                    <p className="txt-apoio text-muted-foreground">Controla se o cadastro de unidades pede a identificação do bloco.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <OptionCard active={config.estruturaBlocos === 'unico'} onClick={() => setConfig({ ...config, estruturaBlocos: 'unico' })} icon={Building2} title="Bloco único" description="Um único prédio ou torre." />
                    <OptionCard active={config.estruturaBlocos === 'multiplos'} onClick={() => setConfig({ ...config, estruturaBlocos: 'multiplos' })} icon={Layers} title="Múltiplos blocos" description="Vários blocos, torres ou alas." />
                  </div>
                </section>

                <Separator />

                {/* Módulos */}
                <section className="space-y-3">
                  <div>
                    <h3 className="txt-subtitulo font-semibold text-foreground">Módulos ativos</h3>
                    <p className="txt-apoio text-muted-foreground">Habilite recursos adicionais para este condomínio.</p>
                  </div>
                  <div className="grid gap-3">
                    <ModuleToggle icon={Car} title="Vagas de garagem" description="Gestão de vagas e locação avulsa." checked={config.moduloVagas} onChange={(v) => setConfig({ ...config, moduloVagas: v })} />
                    <ModuleToggle icon={Bell} title="Mural de avisos" description="Comunicados gerais para os moradores." checked={config.moduloAvisos} onChange={(v) => setConfig({ ...config, moduloAvisos: v })} />
                  </div>
                </section>

                <Separator />

                {/* Janela de envio */}
                <section className="space-y-3">
                  <div>
                    <h3 className="flex items-center gap-2 txt-subtitulo font-semibold text-foreground">
                      <Clock className="h-4 w-4 text-primary" /> Janela de envio no WhatsApp
                    </h3>
                    <p className="txt-apoio text-muted-foreground">Notificações só são disparadas dentro deste horário (recomendado 8h–21h).</p>
                  </div>
                  <div className="grid max-w-md gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="envio-inicio">Início</Label>
                      <Input id="envio-inicio" type="time" value={config.horarioEnvioInicio} onChange={(e) => setConfig({ ...config, horarioEnvioInicio: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="envio-fim">Fim</Label>
                      <Input id="envio-fim" type="time" value={config.horarioEnvioFim} onChange={(e) => setConfig({ ...config, horarioEnvioFim: e.target.value })} />
                    </div>
                  </div>
                </section>
              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex items-center justify-between">
                <p className="hidden items-center gap-1.5 txt-apoio text-muted-foreground sm:flex">
                  <Power className="h-3.5 w-3.5" /> As mudanças afetam telas em todo o sistema.
                </p>
                <Button type="submit" disabled={savingConfig} className="ml-auto">
                  {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar Configurações
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="apartamentos" className="mt-0 animate-in fade-in zoom-in-95 duration-200">
          <ApartamentosManager basePath={base} />
        </TabsContent>

        <TabsContent value="moradores" className="mt-0 animate-in fade-in zoom-in-95 duration-200">
          <MoradoresManager basePath={base} />
        </TabsContent>

        <TabsContent value="equipe" className="mt-0 animate-in fade-in zoom-in-95 duration-200">
          <EquipeManager basePath={base} allowedRoles={['porteiro', 'sindico', 'admin']} />
        </TabsContent>

        {/* O `id!` é seguro: a tela só chega aqui depois de carregar o tenant. */}
        <TabsContent value="assinatura" className="mt-0 animate-in fade-in zoom-in-95 duration-200">
          <AssinaturaCondominioPanel tenantId={id!} podeEditar />
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0 animate-in fade-in zoom-in-95 duration-200">
          <WhatsappCondominioPanel basePath={base} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
