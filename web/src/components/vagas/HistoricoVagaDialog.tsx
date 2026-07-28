import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { HistoricoVaga, Vaga } from '@/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarClock, History, Receipt } from 'lucide-react';
import {
  fmtCompetencia,
  fmtData,
  fmtMoeda,
  nomeLocatario,
  STATUS_COBRANCA_META,
  STATUS_LOCACAO_META,
} from './vagas-shared';

/**
 * Tudo o que já aconteceu com a vaga, em ordem: cada contrato com o que foi
 * cobrado, o que entrou e o que ficou em aberto.
 *
 * Contrato encerrado continua aqui — inclusive com pendência. Encerrar contrato
 * não perdoa dívida, e o síndico precisa conseguir olhar para trás e responder
 * "quem alugou esta vaga e quanto ficou devendo?".
 */
export function HistoricoVagaDialog({
  vaga,
  onOpenChange,
}: {
  vaga: Vaga | null;
  onOpenChange: (aberto: boolean) => void;
}) {
  const historicoQuery = useQuery({
    queryKey: ['vaga-historico', vaga?.id],
    queryFn: () => api.get<HistoricoVaga>(`/vagas/${vaga!.id}/historico`),
    enabled: !!vaga,
  });

  const historico = historicoQuery.data;

  return (
    <Dialog open={!!vaga} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico da vaga {vaga?.numero}</DialogTitle>
          <DialogDescription>
            Contratos, cobranças e pagamentos — inclusive de locações já encerradas.
          </DialogDescription>
        </DialogHeader>

        {historicoQuery.isLoading || !historico ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : historico.locacoes.length === 0 ? (
          <EmptyState
            icon={History}
            title="Esta vaga nunca foi alugada"
            description="Quando houver um contrato, ele aparece aqui com as cobranças e os pagamentos."
          />
        ) : (
          <div className="space-y-5">
            {/* Resumo de tudo */}
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-4">
              <div>
                <dt className="txt-apoio text-muted-foreground">Contratos</dt>
                <dd className="font-mono txt-numero-sm font-semibold text-foreground">
                  {historico.resumo.totalContratos}
                </dd>
              </div>
              <div>
                <dt className="txt-apoio text-muted-foreground">Recebido</dt>
                <dd className="font-mono txt-numero-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {fmtMoeda(historico.resumo.valorRecebido)}
                </dd>
              </div>
              <div>
                <dt className="txt-apoio text-muted-foreground">Em aberto</dt>
                <dd className="font-mono txt-numero-sm font-semibold text-amber-600 dark:text-amber-400">
                  {fmtMoeda(historico.resumo.valorEmAberto)}
                </dd>
              </div>
              <div>
                <dt className="txt-apoio text-muted-foreground">Vencido</dt>
                <dd className="font-mono txt-numero-sm font-semibold text-red-600 dark:text-red-400">
                  {fmtMoeda(historico.resumo.valorVencido)}
                </dd>
              </div>
            </dl>

            {/* Um bloco por contrato, do mais recente para o mais antigo */}
            {historico.locacoes.map((locacao) => {
              const meta = STATUS_LOCACAO_META[locacao.status];
              return (
                <section
                  key={locacao.id}
                  className="space-y-3 rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="txt-corpo font-semibold text-foreground">
                        {nomeLocatario(locacao)}
                      </p>
                      <p className="flex items-center gap-1.5 txt-apoio text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {fmtData(locacao.dataInicio)} →{' '}
                        {locacao.dataFim ? fmtData(locacao.dataFim) : 'em vigor'}
                        {' · '}
                        {fmtMoeda(locacao.valorMensal)}/mês
                      </p>
                    </div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>

                  {locacao.cobrancas.length === 0 ? (
                    <p className="txt-apoio text-muted-foreground">
                      Nenhuma cobrança gerada para este contrato.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {locacao.cobrancas.map((cobranca) => {
                          const metaCobranca = STATUS_COBRANCA_META[cobranca.status];
                          return (
                            <li
                              key={cobranca.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
                            >
                              <span className="flex items-center gap-2 txt-corpo">
                                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-foreground">
                                  {fmtCompetencia(cobranca.competencia)}
                                </span>
                                <span className="text-muted-foreground">
                                  vence {fmtData(cobranca.vencimento)}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-mono txt-corpo text-foreground">
                                  {fmtMoeda(cobranca.valor)}
                                </span>
                                {cobranca.pagoAt && (
                                  <span className="font-mono txt-apoio text-muted-foreground">
                                    pago {fmtData(cobranca.pagoAt)}
                                  </span>
                                )}
                                <Badge variant={metaCobranca.variant}>{metaCobranca.label}</Badge>
                              </span>
                            </li>
                          );
                        })}
                      </ul>

                      <dl className="flex flex-wrap gap-x-6 gap-y-1 txt-corpo">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Cobrado:</dt>
                          <dd className="font-mono text-foreground">
                            {fmtMoeda(locacao.totais.valorCobrado)}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Recebido:</dt>
                          <dd className="font-mono text-emerald-600 dark:text-emerald-400">
                            {fmtMoeda(locacao.totais.valorRecebido)}
                          </dd>
                        </div>
                        {locacao.totais.valorEmAberto > 0 && (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground">Em aberto:</dt>
                            <dd className="font-mono text-amber-600 dark:text-amber-400">
                              {fmtMoeda(locacao.totais.valorEmAberto)}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-[48px] w-full sm:w-auto"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
