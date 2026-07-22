import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Apartamento, Encomenda, Morador } from '../api/types';
import { ScannerModal } from '../components/ScannerModal';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Camera, Package, Building2, User, Truck, FileText, ArrowRight, ArrowLeft, CheckCircle2, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const CORREIOS_RE = /^[A-Z]{2}\d{9}[A-Z]{2}$/i;

function detectarTransportadora(raw: string): string | undefined {
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
  
  // Dados do form
  const [q, setQ] = useState('');
  const [aptos, setAptos] = useState<Apartamento[]>([]);
  const [selectedApto, setSelectedApto] = useState<Apartamento | null>(null);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [moradorId, setMoradorId] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  
  // Status UI
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isSearchingApto, setIsSearchingApto] = useState(false);
  
  // Novo apto
  const [novoApto, setNovoApto] = useState<{ bloco: string; numero: string } | null>(null);
  const [criandoApto, setCriandoApto] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setAptos([]);
      return;
    }
    setIsSearchingApto(true);
    const t = setTimeout(() => {
      const params = `?q=${encodeURIComponent(q.trim())}`;
      api.get<Apartamento[]>(`/apartamentos${params}`)
        .then(setAptos)
        .finally(() => setIsSearchingApto(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!selectedApto) {
      setMoradores([]);
      return;
    }
    api.get<Morador[]>(`/apartamentos/${selectedApto.id}/moradores`)
      .then(setMoradores)
      .catch(() => setMoradores([]));
  }, [selectedApto]);

  const handleScan = (text: string) => {
    setScanning(false);
    const code = extrairCodigo(text);
    setCodigoRastreio(code);
    const t = detectarTransportadora(text);
    if (t) {
      if (!transportadora.trim()) setTransportadora(t);
      if (!descricao.trim()) setDescricao(`Encomenda ${t}`);
    }
    toast.success('Código lido com sucesso!');
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

  // Animações
  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
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
          { num: 3, label: 'Confirmar', icon: CheckCircle2 }
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-2 bg-background px-2">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
              step >= s.num ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-background text-muted-foreground",
            )}>
              <s.icon className="h-5 w-5" />
            </div>
            <span className={cn(
              "text-xs font-medium hidden sm:block",
              step >= s.num ? "text-primary" : "text-muted-foreground"
            )}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader>
                <CardTitle>Para qual apartamento?</CardTitle>
                <CardDescription>Busque o apartamento de destino da encomenda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-10 h-12 text-lg"
                    placeholder="Buscar (Ex: 101, A-101)"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoFocus
                  />
                  {isSearchingApto && (
                    <Loader2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {aptos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { setSelectedApto(a); setStep(2); }}
                      className={cn(
                        "group relative flex flex-col items-center justify-center gap-1 rounded-xl border p-4 transition-all hover:border-primary hover:bg-primary/5",
                        selectedApto?.id === a.id && "border-primary bg-primary/10 ring-1 ring-primary"
                      )}
                    >
                      <Building2 className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="font-mono text-lg font-bold text-foreground">
                        {a.identificador}
                      </span>
                    </button>
                  ))}
                </div>
                
                {q && aptos.length === 0 && !isSearchingApto && (
                  <div className="rounded-lg border border-dashed p-8 text-center animate-in fade-in">
                    <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground mb-4">Nenhum apartamento encontrado.</p>
                    
                    {novoApto === null ? (
                      <Button onClick={() => setNovoApto({ bloco: '', numero: q.replace(/^[A-Za-z]-?/, '').trim() })} variant="outline">
                        Cadastrar "{q}"
                      </Button>
                    ) : (
                      <div className="mx-auto max-w-sm space-y-3 bg-muted/50 p-4 rounded-lg">
                        <div className="grid grid-cols-3 gap-2 text-left">
                          <div className="space-y-1">
                            <Label>Bloco</Label>
                            <Input value={novoApto.bloco} onChange={(e) => setNovoApto({ ...novoApto, bloco: e.target.value })} placeholder="Opcional" />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label>Número *</Label>
                            <Input value={novoApto.numero} onChange={(e) => setNovoApto({ ...novoApto, numero: e.target.value })} autoFocus />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={criarApto} disabled={criandoApto} className="w-full">
                            {criandoApto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Salvar
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
              {selectedApto && (
                <CardFooter className="bg-muted/50 py-4 flex justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Selecionado:</span>
                    <Badge variant="outline" className="font-mono text-base">{selectedApto.identificador}</Badge>
                  </div>
                  <Button onClick={() => setStep(2)}>Avançar <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </CardFooter>
              )}
            </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" variants={slideVariants} initial="initial" animate="animate" exit="exit">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle>Dados do Pacote</CardTitle>
                  <CardDescription>Escaneie ou digite os dados da encomenda.</CardDescription>
                </div>
                <Badge variant="outline" className="font-mono text-lg py-1 px-3 bg-primary/5 text-primary border-primary/20">
                  Apto {selectedApto?.identificador}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                {moradores.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> Destinatário (Opcional)</Label>
                    <select 
                      className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={moradorId} 
                      onChange={(e) => setMoradorId(e.target.value)}
                    >
                      <option value="">— Para qualquer morador do apartamento —</option>
                      {moradores.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} {m.principal ? '(Morador Principal)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
                    ⚠ Sem moradores: A encomenda será salva, mas a notificação no WhatsApp só será enviada quando um morador for cadastrado no apartamento.
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" /> Código de Rastreio</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setScanning(true)} className="h-8 text-primary">
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" /> Transportadora</Label>
                    <Input className="h-12" placeholder="Ex: Correios, Loggi" value={transportadora} onChange={(e) => setTransportadora(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> Descrição</Label>
                    <Input className="h-12" placeholder="Ex: Caixa, Envelope" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-muted-foreground" /> Foto do pacote (Opcional)</Label>
                  {fotoPreview ? (
                    <div className="relative inline-block">
                      <img src={fotoPreview} alt="Preview" className="rounded-xl border shadow-sm max-h-48 object-cover" />
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
                <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
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
              <CardContent>
                <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="text-sm text-muted-foreground">Destino</div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{moradores.find(m => m.id === moradorId)?.nome || 'Qualquer morador'}</span>
                      <Badge variant="default" className="font-mono text-base">{selectedApto?.identificador}</Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground mb-1">Rastreio</div>
                      <div className="font-mono font-medium">{codigoRastreio || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Transportadora</div>
                      <div className="font-medium">{transportadora || '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-muted-foreground mb-1">Descrição</div>
                      <div className="font-medium">{descricao || '—'}</div>
                    </div>
                  </div>

                  {fotoPreview && (
                    <div className="pt-2 border-t">
                      <div className="text-sm text-muted-foreground mb-2">Foto anexada</div>
                      <img src={fotoPreview} alt="Preview" className="h-20 rounded-md border shadow-sm" />
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

      {scanning && <ScannerModal onResult={handleScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
