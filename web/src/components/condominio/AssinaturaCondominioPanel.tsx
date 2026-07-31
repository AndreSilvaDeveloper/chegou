import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  DoorClosed,
  Handshake,
  Loader2,
  Receipt,
  Save,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/api/client';
import type {
  AssinaturaCondicao,
  AssinaturaFatura,
  ContaDoCondominio,
  ModoAssinatura,
  ParticipacaoEmFatura,
} from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Textarea } from '@/components/ui/textarea';
import {
  AvisoVencimentoFaixa,
  ComoFoiCalculado,
  MODO_LABEL,
  StatusFaturaBadge,
} from '@/components/assinatura/assinatura-shared';
import { mensagemErro } from '@/lib/erros';
import { fmtCompetencia, fmtData, fmtMoeda } from '@/lib/formato';

interface Props {
  tenantId: string;
  /**
   * Superadmin edita; administradora só lê.
   *
   * Também decide o endpoint: a plataforma pergunta por
   * `/admin/assinaturas/condominios/:id`, a administradora por
   * `/minha-administradora/condominios/:id/assinatura`, que confere a carteira
   * antes de responder.
   */
  podeEditar: boolean;
}

const MODOS: { value: ModoAssinatura; label: string }[] = [
  { value: 'tabela', label: MODO_LABEL.tabela },
  { value: 'preco_apartamento', label: MODO_LABEL.preco_apartamento },
  { value: 'valor_fixo', label: MODO_LABEL.valor_fixo },
];

const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão', 'Outro'].map(
  (f) => ({ value: f, label: f }),
);

/** Dias 1 a 31 + a opção de voltar ao padrão da plataforma. */
function opcoesDeDia(padrao: number) {
  return [
    { value: '', label: `Padrão da plataforma (dia ${padrao})` },
    ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Dia ${i + 1}` })),
  ];
}

/**
 * A assinatura de **um** condomínio, dentro da tela dele.
 *
 * Responde as quatro perguntas que antes exigiam abrir a tela geral de
 * assinaturas e procurar o cliente na lista: quanto custa, por que custa isso,
 * quando vence e o que já foi cobrado.
 *
 * Serve os dois perfis com o mesmo desenho: o superadmin opera (preço especial,
 * vencimento, baixa) e a administradora lê. Quem decide é `podeEditar` — a
 * aparência não muda, o que muda é o que dá para salvar.
 */
export function AssinaturaCondominioPanel({ tenantId, podeEditar }: Props) {
  const queryClient = useQueryClient();
  const chave = ['conta-condominio', tenantId, podeEditar];
  const rota = podeEditar
    ? `/admin/assinaturas/condominios/${tenantId}`
    : `/minha-administradora/condominios/${tenantId}/assinatura`;

  const contaQuery = useQuery({
    queryKey: chave,
    queryFn: () => api.get<ContaDoCondominio>(rota),
  });

  const [dia, setDia] = useState<string | null>(null);
  const [novaCondicao, setNovaCondicao] = useState(false);
  const [pagando, setPagando] = useState<AssinaturaFatura | null>(null);
  const [cancelando, setCancelando] = useState<AssinaturaFatura | null>(null);
  const [encerrando, setEncerrando] = useState<AssinaturaCondicao | null>(null);

  const aplicar = (data: ContaDoCondominio) => {
    queryClient.setQueryData(chave, data);
    // A conta do próprio cliente (menu e tela de assinatura) pode ter mudado
    // junto — dar baixa aqui apaga o ponto de vencimento de lá.
    queryClient.invalidateQueries({ queryKey: ['minha-assinatura'] });
  };
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chave });

  const salvarDia = useMutation({
    mutationFn: (diaVencimento: number | null) =>
      api.patch<ContaDoCondominio>(`/admin/assinaturas/condominios/${tenantId}/vencimento`, {
        diaVencimento,
      }),
    onSuccess: (data) => {
      toast.success('Vencimento salvo. Vale a partir da próxima fatura gerada.');
      setDia(null);
      aplicar(data);
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível salvar o vencimento')),
  });

  const criarCondicao = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/admin/assinaturas/condicoes', body),
    onSuccess: () => {
      toast.success('Preço especial cadastrado.');
      setNovaCondicao(false);
      recarregar();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível cadastrar o preço')),
  });

  const encerrarCondicao = useMutation({
    mutationFn: (id: string) => api.post(`/admin/assinaturas/condicoes/${id}/encerrar`, {}),
    onSuccess: () => {
      toast.success('Preço especial encerrado. O condomínio volta para a tabela.');
      setEncerrando(null);
      recarregar();
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível encerrar o preço')),
  });

  const pagarFatura = useMutation({
    mutationFn: ({ id, ...body }: { id: string; pagaEm?: string; formaPagamento?: string; observacao?: string }) =>
      api.post(`/admin/assinaturas/faturas/${id}/pagar`, body),
    onSuccess: () => {
      toast.success('Pagamento registrado.');
      setPagando(null);
      recarregar();
      queryClient.invalidateQueries({ queryKey: ['minha-assinatura'] });
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível registrar o pagamento')),
  });

  const cancelarFatura = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      api.post(`/admin/assinaturas/faturas/${id}/cancelar`, motivo ? { motivo } : {}),
    onSuccess: () => {
      toast.success('Fatura cancelada.');
      setCancelando(null);
      recarregar();
      queryClient.invalidateQueries({ queryKey: ['minha-assinatura'] });
    },
    onError: (e: ApiError) => toast.error(mensagemErro(e, 'Não foi possível cancelar a fatura')),
  });

  if (contaQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const conta = contaQuery.data;
  if (!conta) return null;

  const daCarteira = conta.responsavel.via === 'administradora';
  const condicaoVigente = conta.condicoes.find((c) => !c.vigenteAte && c.ativo) ?? null;
  const diaEscolhido = dia ?? (conta.diaVencimento ? String(conta.diaVencimento) : '');
  const diaMudou = dia !== null && dia !== (conta.diaVencimento ? String(conta.diaVencimento) : '');

  return (
    <div className="space-y-6">
      {conta.aviso && <AvisoVencimentoFaixa aviso={conta.aviso} />}

      {/* Quem paga. Sem esta faixa, um condomínio de carteira pareceria um
          cliente que nunca foi cobrado. */}
      {daCarteira && (
        <div className="flex gap-3 rounded-xl bg-muted/40 p-4 md:p-5">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="txt-subtitulo font-semibold text-foreground">
              Quem paga é {conta.responsavel.nome}
            </p>
            <p className="txt-apoio text-muted-foreground">
              Este condomínio não tem fatura própria: ele entra na conta da administradora, junto
              com os outros da carteira. Preço, desconto e vencimento são os dela.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- conta */}
      <Card>
        <CardHeader>
          <CardTitle>{daCarteira ? 'Quanto este condomínio soma' : 'Conta deste mês'}</CardTitle>
          <CardDescription>
            {daCarteira
              ? 'A parte da conta da administradora que vem deste condomínio, se o mês fechasse hoje.'
              : 'O que seria cobrado se a competência fechasse hoje. A fatura é emitida no fechamento do mês.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-0 md:pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              title="Apartamentos ativos"
              value={conta.participacaoAtual?.apartamentos ?? 0}
              icon={DoorClosed}
              description="Só unidade ativa entra na conta — desativar uma tira o custo dela."
            />
            <StatCard
              title={daCarteira ? 'Soma na carteira' : 'Valor do mês'}
              value={fmtMoeda(conta.participacaoAtual?.subtotal ?? conta.conta?.resultado.valor ?? 0)}
              icon={Receipt}
              variant="primary"
            />
          </div>

          <div className="space-y-2 rounded-xl bg-muted/30 p-4">
            <p className="eyebrow">Como foi calculado</p>
            {conta.conta ? (
              <ComoFoiCalculado resultado={conta.conta.resultado} />
            ) : (
              <p className="txt-apoio text-muted-foreground">
                O preço por apartamento é o da <b className="text-foreground">carteira inteira</b> —
                quanto mais unidades a administradora tem somadas, menor a faixa que vale para
                todos os condomínios dela, este inclusive.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------- preço especial */}
      {!daCarteira && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Preço especial</CardTitle>
              <CardDescription>
                O que foi negociado com este condomínio. Sem nenhum, vale a tabela da plataforma.
              </CardDescription>
            </div>
            {podeEditar && (
              <Button
                variant="outline"
                onClick={() => setNovaCondicao(true)}
                className="shrink-0"
              >
                <Tag className="mr-2 h-4 w-4" /> Negociar
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 pt-0 md:pt-0">
            {conta.condicoes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center txt-apoio text-muted-foreground">
                Nenhum preço especial. Este condomínio segue a tabela de preços da plataforma.
              </p>
            ) : (
              conta.condicoes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="txt-subtitulo font-semibold text-foreground">
                        {MODO_LABEL[c.modo]}
                      </span>
                      {c.vigenteAte ? (
                        <Badge variant="outline">Encerrado</Badge>
                      ) : (
                        <Badge variant="success">Em vigor</Badge>
                      )}
                    </div>
                    <p className="txt-apoio text-muted-foreground">
                      {c.modo === 'preco_apartamento' && `${fmtMoeda(c.precoApartamento)} por apartamento. `}
                      {c.modo === 'valor_fixo' && `${fmtMoeda(c.valorFixo)} por mês. `}
                      {c.descontoPercentual ? `Desconto de ${c.descontoPercentual}%. ` : ''}
                      De {fmtData(c.vigenteDe)} {c.vigenteAte ? `até ${fmtData(c.vigenteAte)}` : 'em diante'}.
                    </p>
                    {c.observacao && (
                      <p className="txt-apoio text-muted-foreground italic">{c.observacao}</p>
                    )}
                  </div>
                  {podeEditar && !c.vigenteAte && (
                    <Button
                      variant="outline"
                      onClick={() => setEncerrando(c)}
                      className="shrink-0"
                    >
                      <Handshake className="mr-2 h-4 w-4" /> Encerrar
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------- vencimento */}
      {!daCarteira && podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle>Vencimento da cobrança</CardTitle>
            <CardDescription>
              O dia em que a fatura deste condomínio vence, sempre no mês seguinte ao da
              competência (a assinatura é pós-paga).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0 md:pt-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2 sm:max-w-xs sm:flex-1">
                <Label htmlFor="dia-vencimento">Dia do vencimento</Label>
                <SimpleSelect
                  id="dia-vencimento"
                  value={diaEscolhido}
                  onValueChange={setDia}
                  options={opcoesDeDia(conta.diaVencimentoPadrao)}
                  disabled={salvarDia.isPending}
                />
              </div>
              <Button
                onClick={() => salvarDia.mutate(diaEscolhido ? Number(diaEscolhido) : null)}
                disabled={!diaMudou || salvarDia.isPending}
                className="sm:w-auto"
              >
                {salvarDia.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar vencimento
              </Button>
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2.5 txt-apoio text-muted-foreground">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Vale da próxima geração em diante — <b className="text-foreground">fatura já
                emitida não muda de vencimento</b>, porque o vencimento dela é o que foi combinado
                na hora da cobrança. Dia 29, 30 ou 31 em mês curto cai no último dia do mês.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------- histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de cobrança</CardTitle>
          <CardDescription>
            {daCarteira
              ? 'As faturas da administradora em que este condomínio entrou, e quanto ele representou em cada uma.'
              : 'Todas as faturas emitidas para este condomínio, da mais recente para a mais antiga.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 md:pt-0">
          {daCarteira ? (
            conta.participacoes.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="Nenhuma cobrança ainda"
                description="Este condomínio ainda não entrou em nenhuma fatura da administradora."
              />
            ) : (
              conta.participacoes.map((p) => <LinhaParticipacao key={p.faturaId} participacao={p} />)
            )
          ) : conta.faturas.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma fatura emitida"
              description="As faturas aparecem aqui depois que a competência é fechada na tela de Assinaturas."
            />
          ) : (
            conta.faturas.map((f) => (
              <LinhaFatura
                key={f.id}
                fatura={f}
                podeEditar={podeEditar}
                onPagar={() => setPagando(f)}
                onCancelar={() => setCancelando(f)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ diálogos */}
      {podeEditar && (
        <>
          <DialogPrecoEspecial
            open={novaCondicao}
            onOpenChange={setNovaCondicao}
            saving={criarCondicao.isPending}
            temVigente={Boolean(condicaoVigente)}
            onSubmit={(body) => criarCondicao.mutate({ ...body, tenantId })}
          />

          <ConfirmDialog
            open={Boolean(encerrando)}
            onOpenChange={(o) => !o && setEncerrando(null)}
            title="Encerrar o preço especial?"
            description="O condomínio volta para a tabela de preços da plataforma a partir de hoje. O histórico continua aqui — encerrar não apaga o que explicou as faturas passadas."
            confirmLabel="Encerrar preço especial"
            loading={encerrarCondicao.isPending}
            onConfirm={() => encerrando && encerrarCondicao.mutate(encerrando.id)}
          />

          <DialogPagamento
            fatura={pagando}
            onOpenChange={(o) => !o && setPagando(null)}
            saving={pagarFatura.isPending}
            onSubmit={(body) => pagando && pagarFatura.mutate({ id: pagando.id, ...body })}
          />

          <DialogCancelamento
            fatura={cancelando}
            onOpenChange={(o) => !o && setCancelando(null)}
            saving={cancelarFatura.isPending}
            onSubmit={(motivo) => cancelando && cancelarFatura.mutate({ id: cancelando.id, motivo })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pedaços

function LinhaFatura({
  fatura,
  podeEditar,
  onPagar,
  onCancelar,
}: {
  fatura: AssinaturaFatura;
  podeEditar: boolean;
  onPagar: () => void;
  onCancelar: () => void;
}) {
  const aberta = fatura.status === 'aberta' || fatura.status === 'vencida';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="txt-subtitulo font-semibold text-foreground">
            {fmtCompetencia(fatura.competencia)}
          </span>
          <StatusFaturaBadge status={fatura.status} />
        </div>
        <p className="txt-apoio text-muted-foreground">
          {fatura.quantidadeApartamentos} apartamento{fatura.quantidadeApartamentos === 1 ? '' : 's'}{' '}
          · vence {fmtData(fatura.vencimento)}
          {fatura.pagaEm && ` · paga em ${fmtData(fatura.pagaEm.slice(0, 10))}`}
          {fatura.formaPagamento && ` (${fatura.formaPagamento})`}
        </p>
        {fatura.observacao && (
          <p className="txt-apoio text-muted-foreground italic">{fatura.observacao}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="txt-numero-sm font-bold text-foreground">{fmtMoeda(fatura.valor)}</span>
        {podeEditar && aberta && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPagar} >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Dar baixa
            </Button>
            <Button variant="ghost" onClick={onCancelar} aria-label="Cancelar fatura">
              <Ban className="mr-2 h-4 w-4" /> Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinhaParticipacao({ participacao: p }: { participacao: ParticipacaoEmFatura }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="txt-subtitulo font-semibold text-foreground">
            {fmtCompetencia(p.competencia)}
          </span>
          <StatusFaturaBadge status={p.status} />
        </div>
        <p className="txt-apoio text-muted-foreground">
          {p.apartamentos} apartamento{p.apartamentos === 1 ? '' : 's'} · vence {fmtData(p.vencimento)}{' '}
          · na fatura de {p.sacadoNome}, de {fmtMoeda(p.valorFatura)}
        </p>
      </div>
      <span className="shrink-0 txt-numero-sm font-bold text-foreground">{fmtMoeda(p.subtotal)}</span>
    </div>
  );
}

// --------------------------------------------------------------- diálogos

function DialogPrecoEspecial({
  open,
  onOpenChange,
  saving,
  temVigente,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  temVigente: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [modo, setModo] = useState<ModoAssinatura>('preco_apartamento');
  const [preco, setPreco] = useState('');
  const [valorFixo, setValorFixo] = useState('');
  const [desconto, setDesconto] = useState('');
  const [vigenteDe, setVigenteDe] = useState('');
  const [observacao, setObservacao] = useState('');

  const submit = () => {
    const body: Record<string, unknown> = { modo };
    if (modo === 'preco_apartamento') body.precoApartamento = Number(preco.replace(',', '.'));
    if (modo === 'valor_fixo') body.valorFixo = Number(valorFixo.replace(',', '.'));
    if (desconto) body.descontoPercentual = Number(desconto.replace(',', '.'));
    if (vigenteDe) body.vigenteDe = vigenteDe;
    if (observacao) body.observacao = observacao;
    onSubmit(body);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Preço especial do condomínio"
      description="O que este condomínio paga, no lugar da tabela da plataforma."
      submitLabel="Cadastrar preço"
      saving={saving}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor="modo">Como cobrar</Label>
        <SimpleSelect
          id="modo"
          value={modo}
          onValueChange={(v) => setModo(v as ModoAssinatura)}
          options={MODOS}
          disabled={saving}
        />
      </div>

      {modo === 'preco_apartamento' && (
        <div className="space-y-2">
          <Label htmlFor="preco">Preço por apartamento (R$)</Label>
          <Input
            id="preco"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            placeholder="3,49"
            disabled={saving} />
        </div>
      )}

      {modo === 'valor_fixo' && (
        <div className="space-y-2">
          <Label htmlFor="valor-fixo">Valor fixo mensal (R$)</Label>
          <Input
            id="valor-fixo"
            inputMode="decimal"
            value={valorFixo}
            onChange={(e) => setValorFixo(e.target.value)}
            placeholder="450,00"
            disabled={saving} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="desconto">Desconto (%)</Label>
        <Input
          id="desconto"
          inputMode="decimal"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          placeholder="Opcional"
          disabled={saving} />
        <p className="txt-apoio text-muted-foreground">
          Aplicado por último, sobre qualquer uma das formas acima.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vigente-de">Vale a partir de</Label>
        <Input
          id="vigente-de"
          type="date"
          value={vigenteDe}
          onChange={(e) => setVigenteDe(e.target.value)}
          disabled={saving} />
        <p className="txt-apoio text-muted-foreground">
          Em branco = hoje.{' '}
          {temVigente &&
            'O preço em vigor hoje é encerrado na véspera desta data — o histórico continua, é ele que explica as faturas antigas.'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea
          id="observacao"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Por que este preço foi combinado"
          disabled={saving}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}

function DialogPagamento({
  fatura,
  onOpenChange,
  saving,
  onSubmit,
}: {
  fatura: AssinaturaFatura | null;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  onSubmit: (body: { pagaEm?: string; formaPagamento?: string; observacao?: string }) => void;
}) {
  const [pagaEm, setPagaEm] = useState('');
  const [forma, setForma] = useState('PIX');
  const [observacao, setObservacao] = useState('');

  return (
    <FormDialog
      open={Boolean(fatura)}
      onOpenChange={onOpenChange}
      title="Registrar pagamento"
      description={
        fatura
          ? `Fatura de ${fmtCompetencia(fatura.competencia)}, de ${fmtMoeda(fatura.valor)}.`
          : undefined
      }
      submitLabel="Registrar pagamento"
      saving={saving}
      onSubmit={() =>
        onSubmit({
          ...(pagaEm ? { pagaEm } : {}),
          formaPagamento: forma,
          ...(observacao ? { observacao } : {}),
        })
      }
    >
      <div className="space-y-2">
        <Label htmlFor="paga-em">Data do pagamento</Label>
        <Input
          id="paga-em"
          type="date"
          value={pagaEm}
          onChange={(e) => setPagaEm(e.target.value)}
          disabled={saving} />
        <p className="txt-apoio text-muted-foreground">
          Em branco = agora. Preencha quando o dinheiro entrou em outro dia — é essa data que
          explica um pagamento registrado com atraso.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="forma">Forma de pagamento</Label>
        <SimpleSelect
          id="forma"
          value={forma}
          onValueChange={setForma}
          options={FORMAS_PAGAMENTO}
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="obs-pagamento">Observação</Label>
        <Textarea
          id="obs-pagamento"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Número do comprovante, por exemplo"
          disabled={saving}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}

function DialogCancelamento({
  fatura,
  onOpenChange,
  saving,
  onSubmit,
}: {
  fatura: AssinaturaFatura | null;
  onOpenChange: (o: boolean) => void;
  saving: boolean;
  onSubmit: (motivo?: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <FormDialog
      open={Boolean(fatura)}
      onOpenChange={onOpenChange}
      title="Cancelar a fatura?"
      description={
        fatura
          ? `A fatura de ${fmtCompetencia(fatura.competencia)} sai dos totais da plataforma: cancelada não é cobrança nem dívida.`
          : undefined
      }
      submitLabel="Cancelar fatura"
      cancelLabel="Voltar"
      saving={saving}
      onSubmit={() => onSubmit(motivo || undefined)}
    >
      <div className="space-y-2">
        <Label htmlFor="motivo">Motivo</Label>
        <Textarea
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Fica gravado na fatura — é o que explica o cancelamento daqui a um ano"
          disabled={saving}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}
