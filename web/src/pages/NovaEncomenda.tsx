import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AuthenticatedUser } from '../api/client';
import { Apartamento, Encomenda, Morador } from '../api/types';
import { ScannerModal } from '../components/ScannerModal';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Combobox } from '@/components/ui/combobox';
import { OPCOES_TRANSPORTADORA, type TransportadoraNome } from '@/lib/transportadoras';
import {
  Camera, Package, Building2, User, Truck, FileText, ArrowRight, ArrowLeft, CheckCircle2,
  Loader2, Image as ImageIcon, X, AlertTriangle, ScanLine, Keyboard, Layers, DoorClosed,
  Plus, Mail, Box,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const CORREIOS_RE = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;

/**
<<<<<<< Updated upstream
 * Adivinha a transportadora pelo que foi escaneado.
 *
 * O retorno é `TransportadoraNome`, o tipo derivado de `TRANSPORTADORAS`: um
 * nome que não esteja na lista **não compila**. É o que garante que o pacote
 * escaneado e o digitado à mão fiquem com a mesma grafia — sem isso o relatório
 * por transportadora se dividiria em duas linhas para a mesma empresa.
 */
function detectarTransportadora(raw: string): TransportadoraNome | undefined {
 /*
 * Detecta a transportadora pelo conteúdo do QR / código de barras.
 *
 * Existe um primo disto no backend (`src/modules/etiquetas/parser/
 * transportadoras.ts`), que roda sobre o texto da etiqueta lido por OCR —
 * outra entrada, outro problema, mas a mesma lista de transportadoras.
 * Ao acrescentar uma nova, mexa nos dois.
 */
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    const u = s.toLowerCase();
    if (/correios|linkcorreios|rastreamento\.correios|melhorrastreio.*correios/.test(u)) return 'Correios';
    if (/mercadoli(v|b)re|mercadoenvios|mercadolivre/.test(u)) return 'Mercado Livre';
    if (/shopee|spx\.com|spx\.br/.test(u)) return 'Shopee';
    if (/loggi/.test(u)) return 'Loggi';
    if (/jadlog/.test(u)) return 'Jadlog';
    if (/total\W*express/.test(u)) return 'Total Express';
    if (/jt\W*express|jtexpress|jet\.com\.br/.test(u)) return 'J&T Express';
    if (/\bamazon\b/.test(u)) return 'Amazon';
    if (/\bdhl\b/.test(u)) return 'DHL';
    if (/\bfedex\b/.test(u)) return 'FedEx';
    if (/braspress/.test(u)) return 'Braspress';
    if (/azul\W*cargo|azulcargo/.test(u)) return 'Azul Cargo';
    return undefined;
  }
  const c = s.toUpperCase();
  if (CORREIOS_RE.test(c)) return 'Correios';
  if (/^TBA\d{6,}$/.test(c)) return 'Amazon';
  if (/^SPX[A-Z0-9]/.test(c)) return 'Shopee';
  if (/^J[TD]\d{8,}$/.test(c)) return 'J&T Express';
  return undefined;
}

function extrairCodigo(raw: string): string {
  let code = raw.trim();
  if (/^\s*[{[]/.test(code)) {
    try {
      const obj = JSON.parse(code);
      const v = obj?.code ?? obj?.codigo ?? obj?.trackingNumber ?? obj?.tracking ?? obj?.codigoRastreio;
      if (typeof v === 'string' && v.trim()) code = v.trim();
    } catch {}
  }
  if (/^https?:\/\//i.test(code)) {
    const m = code.match(/[A-Z]{2}\d{9}[A-Z]{2}|[A-Z0-9]{10,40}/i);
    if (m) code = m[0];
  }
  return code.slice(0, 80);
}

export function NovaEncomenda() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);

  // Config do condomínio
  const [estruturaBlocos, setEstruturaBlocos] = useState<'unico' | 'multiplos'>('unico');

  // Sub-fluxo do step 1 (destino)
  const [entrada, setEntrada] = useState<'escolha' | 'manual'>('escolha');
  const [blocos, setBlocos] = useState<string[]>([]);
  const [loadingBlocos, setLoadingBlocos] = useState(false);
  const [blocoSel, setBlocoSel] = useState<string | null>(null);
  const [numeroInput, setNumeroInput] = useState('');
  const [aptosFiltrados, setAptosFiltrados] = useState<Apartamento[]>([]);
  const [filtrando, setFiltrando] = useState(false);
  const [buscandoApto, setBuscandoApto] = useState(false);

  // Dados do form
  const [selectedApto, setSelectedApto] = useState<Apartamento | null>(null);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [moradorId, setMoradorId] = useState<string>('');
  const [tipo, setTipo] = useState<'caixa' | 'envelope' | null>(null);
  const [descricao, setDescricao] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Status UI
  const [saving, setSaving] = useState(false);
  const [scanTarget, setScanTarget] = useState<'destino' | 'pacote' | null>(null);

  // Novo apto (quando não existe)
  const [novoApto, setNovoApto] = useState<{ bloco: string; numero: string } | null>(null);
  const [criandoApto, setCriandoApto] = useState(false);

  // Carrega config do condomínio (estrutura de blocos)
  useEffect(() => {
    api.get<AuthenticatedUser>('/auth/me')
      .then((me) => {
        setEstruturaBlocos(me.config?.estruturaBlocos === 'multiplos' ? 'multiplos' : 'unico');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedApto) {
      setMoradores([]);
      return;
    }
    api.get<Morador[]>(`/apartamentos/${selectedApto.id}/moradores`)
      .then(setMoradores)
      .catch(() => setMoradores([]));
  }, [selectedApto]);

  // Filtro ao vivo dos apartamentos no cadastro manual
  useEffect(() => {
    const podeFiltrar = entrada === 'manual' && (estruturaBlocos !== 'multiplos' || !!blocoSel);
    const numero = numeroInput.trim();
    const termoBusca = blocoSel ? (numero ? `${blocoSel}-${numero}` : blocoSel) : numero;
    if (!podeFiltrar || !termoBusca) {
      setAptosFiltrados([]);
      return;
    }
    setFiltrando(true);
    const t = setTimeout(() => {
      api.get<Apartamento[]>(`/apartamentos?q=${encodeURIComponent(termoBusca)}`)
        .then((list) => {
          let res = list;
          if (blocoSel) res = res.filter((a) => (a.bloco ?? '') === blocoSel);
          if (numero) res = res.filter((a) => a.numero.toLowerCase().includes(numero.toLowerCase()));
          setAptosFiltrados(res);
        })
        .catch(() => setAptosFiltrados([]))
        .finally(() => setFiltrando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [numeroInput, blocoSel, entrada, estruturaBlocos]);

  const carregarBlocos = () => {
    if (blocos.length > 0) return;
    setLoadingBlocos(true);
    api.get<string[]>('/apartamentos/blocos')
      .then(setBlocos)
      .catch(() => setBlocos([]))
      .finally(() => setLoadingBlocos(false));
  };

  const irParaManual = () => {
    setNovoApto(null);
    setEntrada('manual');
    if (estruturaBlocos === 'multiplos') carregarBlocos();
  };

  const voltarParaEscolha = () => {
    setEntrada('escolha');
    setBlocoSel(null);
    setNumeroInput('');
    setNovoApto(null);
  };

  const handleScan = async (text: string) => {
    const target = scanTarget;
    setScanTarget(null);

    if (target === 'pacote') {
      const code = extrairCodigo(text);
      setCodigoRastreio(code);
      const t = detectarTransportadora(text);
      if (t) {
        if (!transportadora.trim()) setTransportadora(t);
        if (!descricao.trim()) setDescricao(`Encomenda ${t}`);
      }
      toast.success('Código lido com sucesso!');
      return;
    }

    // Leitura de destino: tenta localizar o apartamento pelo conteúdo lido
    const termo = text.trim();
    try {
      const res = await api.get<Apartamento[]>(`/apartamentos?q=${encodeURIComponent(termo)}`);
      if (res.length === 1) {
        setSelectedApto(res[0]);
        setStep(2);
        toast.success(`Apartamento ${res[0].identificador} localizado`);
        return;
      }
    } catch {}
    // Não localizou automaticamente → cai no manual com o número pré-preenchido
    irParaManual();
    setNumeroInput(termo.replace(/^[A-Za-z]-?/, '').trim());
    toast.message('Não localizado. Confirme o apartamento manualmente.');
  };

  const confirmarDestinoManual = async () => {
    const numero = numeroInput.trim();
    if (estruturaBlocos === 'multiplos' && !blocoSel) {
      toast.error('Selecione o bloco');
      return;
    }
    // Se o filtro já isolou um único apartamento, segue com ele.
    if (aptosFiltrados.length === 1) {
      setSelectedApto(aptosFiltrados[0]);
      setStep(2);
      return;
    }
    if (!numero) {
      toast.error('Digite o número do apartamento');
      return;
    }
    setBuscandoApto(true);
    try {
      const params = new URLSearchParams({ numero });
      if (blocoSel) params.set('bloco', blocoSel);
      const { apartamento } = await api.get<{ apartamento: Apartamento | null }>(
        `/apartamentos/lookup?${params.toString()}`,
      );
      if (apartamento) {
        setSelectedApto(apartamento);
        setStep(2);
      } else {
        setNovoApto({ bloco: blocoSel ?? '', numero });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar apartamento');
    } finally {
      setBuscandoApto(false);
    }
  };

  const criarApto = async () => {
    if (!novoApto || !novoApto.numero.trim()) {
      toast.error('Informe o número do apartamento');
      return;
    }
    setCriandoApto(true);
    try {
      const a = await api.post<Apartamento>('/apartamentos', {
        bloco: novoApto.bloco.trim() || undefined,
        numero: novoApto.numero.trim(),
      });
      setNovoApto(null);
      setSelectedApto(a);
      setStep(2);
      toast.success('Apartamento criado!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar apartamento');
    } finally {
      setCriandoApto(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedApto) return;
    setSaving(true);

    try {
      let fotoUrl: string | undefined;
      if (foto) {
        const fd = new FormData();
        fd.append('file', foto);
        const up = await api.upload<{ url: string }>('/uploads/encomenda-foto', fd);
        fotoUrl = up.url;
      }
      const r = await api.post<Encomenda>('/encomendas', {
        apartamentoId: selectedApto.id,
        moradorDestinoId: moradorId || undefined,
        tipo: tipo || undefined,
        descricao: descricao || undefined,
        transportadora: transportadora || undefined,
        codigoRastreio: codigoRastreio || undefined,
        fotoUrl,
      });
      toast.success('Encomenda registrada e notificação enviada!');
      nav(`/encomendas/${r.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  const precisaBloco = estruturaBlocos === 'multiplos';
  // Só mostra a grade de blocos quando há blocos (ou estão carregando) e nenhum foi escolhido.
  const mostrarSelecaoBloco = precisaBloco && !blocoSel && (loadingBlocos || blocos.length > 0);
  const numeroLiberado = !mostrarSelecaoBloco;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Registrar Encomenda"
        description="Escaneie o pacote ou digite os dados manualmente."
      />

      {/* Stepper visual */}
      <div className="flex items-center justify-between relative px-2">
        <div className="absolute left-0 top-1/2 -z-10 h-0.5 w-full -translate-y-1/2 bg-border" />
        <div className="absolute left-0 top-1/2 -z-10 h-0.5 -translate-y-1/2 bg-primary transition-all duration-500"
             style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }} />
        {[
          { num: 1, label: 'Destino', icon: Building2 },
          { num: 2, label: 'Pacote', icon: Package },
          { num: 3, label: 'Confirmar', icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-2 bg-background px-2">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
              step >= s.num ? 'border-primary bg-primary text-primary-foreground' : 'border-muted bg-background text-muted-foreground',
            )}>
              <s.icon className="h-5 w-5" />
            </div>
            <span className={cn(
              'txt-apoio font-medium hidden sm:block',
              step >= s.num ? 'text-primary' : 'text-muted-foreground',
            )}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && entrada === 'escolha' && (
          <motion.div key="step1-escolha" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader>
                <CardTitle>Como deseja registrar?</CardTitle>
                <CardDescription>Escaneie o código do pacote ou faça o cadastro manual.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 pt-0 md:pt-0">
                <button
                  type="button"
                  onClick={() => setScanTarget('destino')}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 text-center transition-all hover:border-primary hover:bg-primary/10"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <ScanLine className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="txt-subtitulo font-semibold text-foreground">Escanear código</p>
                    <p className="mt-1 txt-apoio text-muted-foreground">QR code ou código de barras</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={irParaManual}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card p-8 text-center transition-all hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <Keyboard className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="txt-subtitulo font-semibold text-foreground">Cadastro manual</p>
                    <p className="mt-1 txt-apoio text-muted-foreground">
                      {precisaBloco ? 'Escolher bloco e apartamento' : 'Digitar o apartamento'}
                    </p>
                  </div>
                </button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 1 && entrada === 'manual' && (
          <motion.div key="step1-manual" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader>
                <CardTitle>
                  {mostrarSelecaoBloco ? 'Selecione o bloco' : 'Qual o apartamento?'}
                </CardTitle>
                <CardDescription>
                  {mostrarSelecaoBloco
                    ? 'Toque no bloco de destino da encomenda.'
                    : 'Digite o número do apartamento de destino.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-0 md:pt-0">
                {/* Seleção de bloco (apenas condomínios com múltiplos blocos) */}
                {mostrarSelecaoBloco && (
                  loadingBlocos ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando blocos...
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {blocos.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBlocoSel(b)}
                          className="flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 transition-all hover:border-primary hover:bg-primary/5"
                        >
                          <Layers className="h-6 w-6 text-muted-foreground" />
                          <span className="txt-secao font-bold text-foreground">{b}</span>
                        </button>
                      ))}
                    </div>
                  )
                )}

                {/* Campo de número (bloco único, ou após escolher o bloco) */}
                {numeroLiberado && (
                  <div className="space-y-4">
                    {blocoSel && (
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                        <div className="flex items-center gap-2 txt-corpo">
                          <Layers className="h-4 w-4 text-primary" />
                          <span className="text-muted-foreground">Bloco</span>
                          <Badge variant="outline" className="font-mono">{blocoSel}</Badge>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => { setBlocoSel(null); setNovoApto(null); }}>
                          Trocar
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="numero" className="flex items-center gap-2">
                        <DoorClosed className="h-4 w-4 text-muted-foreground" /> Número do apartamento
                      </Label>
                      <div className="relative">
                        <Input
                          id="numero"
                          className="h-16 text-center txt-numero font-bold tracking-widest md:h-20"
                          inputMode="numeric"
                          placeholder="Ex: 101"
                          value={numeroInput}
                          onChange={(e) => { setNumeroInput(e.target.value); setNovoApto(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarDestinoManual(); } }}
                          autoFocus
                        />
                        {filtrando && (
                          <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Resultados filtrados (toque para selecionar) */}
                    {aptosFiltrados.length > 0 && (
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                        {aptosFiltrados.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => { setSelectedApto(a); setStep(2); }}
                            className="group flex flex-col items-center justify-center gap-1 rounded-xl border p-4 transition-all hover:border-primary hover:bg-primary/5"
                          >
                            <Building2 className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
                            <span className="font-mono txt-numero-sm font-bold text-foreground">{a.identificador}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Nenhum encontrado → oferecer cadastro */}
                    {novoApto && (
                      <div className="space-y-3 rounded-xl border border-dashed bg-muted/40 p-4">
                        <div className="flex items-start gap-2.5 txt-apoio text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          <span>
                            Apartamento <span className="font-semibold text-foreground">{[novoApto.bloco, novoApto.numero].filter(Boolean).join('-')}</span> ainda não existe. Deseja cadastrá-lo agora?
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={criarApto} disabled={criandoApto} className="flex-1">
                            {criandoApto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Cadastrar e continuar
                          </Button>
                          <Button onClick={() => setNovoApto(null)} variant="ghost" size="icon">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex justify-between">
                <Button variant="ghost" onClick={voltarParaEscolha}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
                <Button onClick={confirmarDestinoManual} disabled={buscandoApto || !numeroLiberado}>
                  {buscandoApto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continuar <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>Dados do Pacote</CardTitle>
                    <CardDescription>Escaneie ou digite os dados da encomenda.</CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0 gap-1.5 whitespace-nowrap border-primary/20 bg-primary/5 px-2.5 py-1 font-mono txt-apoio text-primary">
                    <DoorClosed className="h-3.5 w-3.5" />
                    {selectedApto?.identificador}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-0 md:pt-0">
                {moradores.length > 0 ? (
                  <div className="space-y-2">
                    <Label htmlFor="destinatario" className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> Destinatário (Opcional)</Label>
                    <SimpleSelect
                      id="destinatario"
                      value={moradorId}
                      onValueChange={setMoradorId}
                      options={[
                        { value: '', label: 'Qualquer morador do apartamento' },
                        ...moradores.map((m) => ({
                          value: m.id,
                          label: m.nome,
                          hint: m.principal ? 'Principal' : undefined,
                        })),
                      ]}
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 txt-corpo text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><span className="font-semibold">Sem moradores:</span> a encomenda será salva, mas a notificação no WhatsApp só será enviada quando um morador for cadastrado no apartamento.</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> Código de Rastreio</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setScanTarget('pacote')} className="h-8 text-primary">
                      <Camera className="mr-2 h-4 w-4" /> Escanear
                    </Button>
                  </div>
                  <Input
                    className="h-12 font-mono uppercase"
                    placeholder="Ex: LB123456789BR"
                    value={codigoRastreio}
                    onChange={(e) => setCodigoRastreio(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Box className="h-4 w-4 text-muted-foreground" /> Tipo do pacote (Opcional)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { valor: 'caixa' as const, label: 'Caixa', icon: Package },
                      { valor: 'envelope' as const, label: 'Envelope', icon: Mail },
                    ]).map((opt) => {
                      const ativo = tipo === opt.valor;
                      return (
                        <button
                          key={opt.valor}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => setTipo(ativo ? null : opt.valor)}
                          className={cn(
                            'flex h-12 items-center justify-center gap-2.5 rounded-xl border-1 txt-corpo font-medium transition-all',
                            ativo
                              ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
                              : 'border-border bg-[#FBF9F6] dark:bg-[#121212] text-foreground hover:border-primary/40 text-muted-foreground',
                          )}
                        >
                          <opt.icon className={cn('h-5 w-5', ativo ? 'text-primary' : 'text-muted-foreground')} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                  <div className="space-y-2">
                    <Label htmlFor="transportadora" className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" /> Transportadora</Label>
                    <Combobox
                      id="transportadora"
                      value={transportadora}
                      onValueChange={setTransportadora}
                      options={OPCOES_TRANSPORTADORA}
                      placeholder="Ex: Correios, Loggi"
                      avisoForaDaLista="Fora da lista — será registrado como você digitou."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descricao" className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Descrição</Label>
                    <Textarea
                      id="descricao"
                      rows={3}
                      placeholder="Ex: Caixa grande, frágil"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-muted-foreground" /> Foto do pacote (Opcional)</Label>
                  {fotoPreview ? (
                    <div className="relative inline-block">
                      <img src={fotoPreview} alt="Preview" className="rounded-xl border shadow-xs max-h-48 object-cover" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -right-2 -top-2 h-8 w-8 rounded-full shadow-md"
                        onClick={() => { setFoto(null); setFotoPreview(null); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <Button type="button" variant="outline" className="h-12 w-full border-dashed" onClick={() => document.getElementById('foto-upload')?.click()}>
                        <Camera className="mr-2 h-4 w-4" /> Tirar foto
                      </Button>
                      <input
                        id="foto-upload"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setFoto(f);
                            setFotoPreview(URL.createObjectURL(f));
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex justify-between">
                <Button variant="ghost" onClick={() => { setStep(1); }}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
                <Button onClick={() => setStep(3)}>Revisar <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader>
                <CardTitle>Confirmar Registro</CardTitle>
                <CardDescription>Revise os dados antes de notificar o morador.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 md:pt-0">
                <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="txt-apoio text-muted-foreground">Destino</div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{moradores.find(m => m.id === moradorId)?.nome || 'Qualquer morador'}</span>
                      <Badge variant="default" className="font-mono txt-apoio">{selectedApto?.identificador}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 txt-corpo">
                    <div>
                      <div className="text-muted-foreground mb-1">Rastreio</div>
                      <div className="font-mono font-medium">{codigoRastreio || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Transportadora</div>
                      <div className="font-medium">{transportadora || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Tipo</div>
                      <div className="font-medium">{tipo === 'caixa' ? 'Caixa' : tipo === 'envelope' ? 'Envelope' : '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-muted-foreground mb-1">Descrição</div>
                      <div className="font-medium">{descricao || '—'}</div>
                    </div>
                  </div>

                  {fotoPreview && (
                    <div className="pt-2 border-t">
                      <div className="txt-apoio text-muted-foreground mb-2">Foto anexada</div>
                      <img src={fotoPreview} alt="Preview" className="h-20 rounded-md border shadow-xs" />
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="bg-muted/50 py-4 flex justify-between">
                <Button variant="ghost" disabled={saving} onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
                <Button onClick={submit} disabled={saving} className="min-w-40" size="lg">
                  {saving ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Registrando...</>
                  ) : (
                    <><Package className="mr-2 h-5 w-5" /> Registrar e Notificar</>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {scanTarget && <ScannerModal onResult={handleScan} onClose={() => setScanTarget(null)} />}
    </div>
  );
}
