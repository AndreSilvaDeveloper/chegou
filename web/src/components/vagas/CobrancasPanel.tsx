import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  ResultadoEnvioCobranca,
  ResultadoGeracaoCobrancas,
  ResumoCobrancas,
  StatusCobranca,
  VagaCobranca,
} from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CirclePlus,
  Loader2,
  Receipt,
  Send,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import {
  competenciaAtual,
  fmtCompetencia,
  fmtData,
  fmtMoeda,
  hojeLocal,
  nomeLocatario,
  STATUS_COBRANCA_META,
} from './vagas-shared';

const FILTROS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'pendente', label: 'A enviar' },
  { value: 'enviada', label: 'Enviadas' },
  { value: 'vencida', label: 'Vencidas' },
  { value: 'paga', label: 'Pagas' },
  { value: 'cancelada', label: 'Canceladas' },
];

/** Status em que ainda faz sentido cobrar o responsável. */
const EM_ABERTO: StatusCobranca[] = ['pendente', 'enviada', 'vencida'];

export function CobrancasPanel() {
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [status, setStatus] = useState('');
  const [gerarAberto, setGerarAberto] = useState(false);
  const [pagando, setPagando] = useState<VagaCobranca | null>(null);
  const [cancelando, setCancelando] = useState<VagaCobranca | null>(null);
  const [motivo, setMotivo] = useState('');
  const queryClient = useQueryClient();

  const resumoQuery = useQuery({
    queryKey: ['vagas-cobrancas-resumo', competencia],
    queryFn: () =>
      api.get<ResumoCobrancas>(`/vagas-cobrancas/resumo?competencia=${competencia}`),
    enabled: !!competencia,
  });

  const cobrancasQuery = useQuery({
    queryKey: ['vagas-cobrancas', competencia, status],
    queryFn: () => {
      const params = new URLSearchParams({ competencia });
      if (status) params.set('status', status);
      return api.get<VagaCobranca[]>(`/vagas-cobrancas?${params}`);
    },
    enabled: !!competencia,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['vagas-cobrancas'] });
    queryClient.invalidateQueries({ queryKey: ['vagas-cobrancas-resumo'] });
  };

  const erro = (padrao: string) => (err: unknown) =>
    toast.error(mensagemErro(err, padrao));

  const gerar = useMutation({
    mutationFn: () =>
      api.post<ResultadoGeracaoCobrancas>('/vagas-cobrancas/gerar', { competencia }),
    onSuccess: (r) => {
      const partes = [`${r.criadas} cobrança(s) criada(s)`];
      if (r.jaExistiam) partes.push(`${r.jaExistiam} já existiam`);
      if (r.ignoradas.length) partes.push(`${r.ignoradas.length} ignorada(s)`);
      toast.success(partes.join(' · '));
      // Locação sem valor ou sem contato não vira cobrança — o síndico precisa saber qual.
      for (const ignorada of r.ignoradas.slice(0, 3)) {
        toast.warning(`Vaga ${ignorada.vaga}: ${ignorada.motivo}`);
      }
      invalidar();
      setGerarAberto(false);
    },
    onError: erro('Não foi possível gerar as cobranças'),
  });

  const enviar = useMutation({
    mutationFn: (id: string) => api.post<ResultadoEnvioCobranca>(`/vagas-cobrancas/${id}/enviar`),
    onSuccess: (r) => {
      const { whatsapp, email } = r.envio;
      if (whatsapp === 'enviado') toast.success('Cobrança na fila do WhatsApp.');
      else if (whatsapp === 'opt_out') toast.warning('Responsável não aceita WhatsApp.');
      else toast.warning('Responsável sem telefone cadastrado.');
      if (email === 'enviado') toast.success('Cobrança enviada por e-mail.');
      invalidar();
    },
    onError: erro('Não foi possível enviar a cobrança'),
  });

  const pagar = useMutation({
    mutationFn: (dados: { id: string; valorPago: number; pagoEm: string; observacoes?: string }) =>
      api.post<VagaCobranca>(`/vagas-cobrancas/${dados.id}/pagar`, {
        valorPago: dados.valorPago,
        pagoEm: dados.pagoEm,
        observacoes: dados.observacoes,
      }),
    onSuccess: () => {
      toast.success('Pagamento registrado.');
      invalidar();
      setPagando(null);
    },
    onError: erro('Não foi possível registrar o pagamento'),
  });

  const cancelar = useMutation({
    mutationFn: (dados: { id: string; motivo?: string }) =>
      api.post<VagaCobranca>(`/vagas-cobrancas/${dados.id}/cancelar`, { motivo: dados.motivo }),
    onSuccess: () => {
      toast.success('Cobrança cancelada.');
      invalidar();
      setCancelando(null);
      setMotivo('');
    },
    onError: erro('Não foi possível cancelar a cobrança'),
  });

  const resumo = resumoQuery.data;
  const cobrancas = cobrancasQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Filtros — empilhados no celular, lado a lado no desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cob-competencia" className="text-base">
            Mês de referência
          </Label>
          <Input
            id="cob-competencia"
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cob-status" className="text-base">
            Situação
          </Label>
          <SimpleSelect
            id="cob-status"
            value={status}
            onValueChange={setStatus}
            options={FILTROS}
            placeholder="Todos os status"
          />
        </div>
      </div>

      <Button
        onClick={() => setGerarAberto(true)}
        className="min-h-[48px] w-full sm:w-auto"
        disabled={!competencia}
      >
        <CirclePlus className="mr-2 h-4 w-4" />
        Gerar cobranças do mês
      </Button>

      {resumoQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[116px] rounded-xl" />
          ))}
        </div>
      ) : (
        resumo && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              title="Em aberto"
              value={fmtMoeda(resumo.valorEmAberto)}
              icon={Wallet}
              description={`${resumo.emAberto} cobrança(s)`}
              variant="warning"
            />
            <StatCard
              title="Vencidas"
              value={fmtMoeda(resumo.valorVencido)}
              icon={AlertTriangle}
              description={`${resumo.vencidas} cobrança(s)`}
              variant="danger"
            />
            <StatCard
              title="Recebido"
              value={fmtMoeda(resumo.valorRecebido)}
              icon={CheckCircle2}
              description={`${resumo.pagas} cobrança(s)`}
              variant="success"
            />
          </div>
        )
      )}

      {cobrancasQuery.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[168px] rounded-xl" />
          ))}
        </div>
      ) : cobrancas.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma cobrança neste mês"
          description="Gere as cobranças da competência para as locações vigentes. Rodar de novo não duplica o que já existe."
          actionLabel="Gerar cobranças do mês"
          onAction={() => setGerarAberto(true)}
        />
      ) : (
        <div className="space-y-3">
          {cobrancas.map((cobranca) => {
            const meta = STATUS_COBRANCA_META[cobranca.status];
            const aberta = EM_ABERTO.includes(cobranca.status);
            return (
              <Card key={cobranca.id}>
                <CardContent className="space-y-4 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-foreground">
                        Vaga {cobranca.locacao?.vaga?.numero ?? '—'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {cobranca.locacao ? nomeLocatario(cobranca.locacao) : 'Locação removida'}
                      </p>
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Valor</dt>
                      <dd className="font-mono text-base font-semibold text-foreground">
                        {fmtMoeda(cobranca.valor)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Vencimento</dt>
                      <dd className="font-mono text-base text-foreground">
                        {fmtData(cobranca.vencimento)}
                      </dd>
                    </div>
                    {cobranca.status === 'paga' && (
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Pago em</dt>
                        <dd className="font-mono text-base text-foreground">
                          {fmtData(cobranca.pagoAt)} — {fmtMoeda(cobranca.valorPago)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {aberta && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        onClick={() => enviar.mutate(cobranca.id)}
                        disabled={enviar.isPending}
                        className="min-h-[48px] w-full sm:w-auto"
                      >
                        {enviar.isPending && enviar.variables === cobranca.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {cobranca.enviadaWhatsappAt ? 'Enviar de novo' : 'Enviar cobrança'}
                      </Button>
                      <Button
                        onClick={() => setPagando(cobranca)}
                        className="min-h-[48px] w-full sm:w-auto"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Registrar pagamento
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setMotivo('');
                          setCancelando(cobranca);
                        }}
                        className="min-h-[48px] w-full text-red-600 hover:text-red-600 dark:text-red-400 sm:w-auto"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Cancelar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={gerarAberto}
        onOpenChange={setGerarAberto}
        title={`Gerar cobranças de ${competencia ? fmtCompetencia(`${competencia}-01`) : ''}`}
        description="Cria uma cobrança para cada locação vigente do condomínio. Rodar de novo não duplica as que já existem."
        confirmLabel="Gerar cobranças"
        loading={gerar.isPending}
        onConfirm={() => gerar.mutate()}
      />

      <PagamentoDialog
        cobranca={pagando}
        onOpenChange={(aberto) => !aberto && setPagando(null)}
        salvando={pagar.isPending}
        onConfirm={(dados) => pagando && pagar.mutate({ id: pagando.id, ...dados })}
      />

      <ConfirmDialog
        open={!!cancelando}
        onOpenChange={(aberto) => !aberto && setCancelando(null)}
        title="Cancelar esta cobrança?"
        description={
          cancelando
            ? `Vaga ${cancelando.locacao?.vaga?.numero ?? '—'} · ${fmtMoeda(cancelando.valor)}. A cobrança deixa de contar no total em aberto.`
            : ''
        }
        confirmLabel="Cancelar cobrança"
        cancelLabel="Voltar"
        variant="destructive"
        loading={cancelar.isPending}
        onConfirm={() =>
          cancelando && cancelar.mutate({ id: cancelando.id, motivo: motivo.trim() || undefined })
        }
      >
        <div className="mt-4 space-y-2 text-left">
          <Label htmlFor="cancelar-motivo" className="text-base">
            Motivo (opcional)
          </Label>
          <Textarea
            id="cancelar-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function PagamentoDialog({
  cobranca,
  onOpenChange,
  salvando,
  onConfirm,
}: {
  cobranca: VagaCobranca | null;
  onOpenChange: (open: boolean) => void;
  salvando: boolean;
  onConfirm: (dados: { valorPago: number; pagoEm: string; observacoes?: string }) => void;
}) {
  const [valorPago, setValorPago] = useState('');
  const [pagoEm, setPagoEm] = useState(hojeLocal());
  const [observacoes, setObservacoes] = useState('');

  useEffect(() => {
    if (!cobranca) return;
    setValorPago(String(cobranca.valor));
    setPagoEm(hojeLocal());
    setObservacoes('');
  }, [cobranca]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valorPago || Number(valorPago) < 0) {
      toast.error('Informe o valor recebido');
      return;
    }
    onConfirm({
      valorPago: Number(valorPago),
      pagoEm,
      observacoes: observacoes.trim() || undefined,
    });
  };

  return (
    <Dialog open={!!cobranca} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {cobranca
              ? `Vaga ${cobranca.locacao?.vaga?.numero ?? '—'} · vencimento ${fmtData(cobranca.vencimento)}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pag-valor" className="text-base">
              Valor recebido (R$)
            </Label>
            <Input
              id="pag-valor"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pag-data" className="text-base">
              Data do pagamento
            </Label>
            <Input
              id="pag-data"
              type="date"
              value={pagoEm}
              onChange={(e) => setPagoEm(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pag-obs" className="text-base">
              Observações
            </Label>
            <Textarea
              id="pag-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[48px] w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando} className="min-h-[48px] w-full sm:w-auto">
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
