import { Briefcase, Building2, CalendarClock, CreditCard, Info, Receipt, Wallet } from 'lucide-react';
import type { AssinaturaFatura, MinhaAssinatura } from '@/api/types';
import {
  AvisoVencimentoFaixa,
  ComoFoiCalculado,
  MODO_LABEL,
  StatusFaturaBadge,
} from '@/components/assinatura/assinatura-shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { useMinhaAssinatura } from '@/hooks/use-assinatura';
import { useAuthMe } from '@/hooks/use-tenant-config';
import { fmtCompetencia, fmtData, fmtMoeda } from '@/lib/formato';

/**
 * A assinatura do Chegou vista pelo cliente.
 *
 * Uma tela para dois perfis, porque a pergunta é a mesma ("quanto eu pago e
 * por quê?") — muda só de onde vem a resposta:
 *
 * - **administradora**: a carteira inteira numa conta só (`/minha-administradora`)
 * - **síndico**: o próprio condomínio (`/assinatura`)
 *
 * O síndico de condomínio que pertence a uma administradora não tem conta: a
 * tela diz com quem é a cobrança, em vez de mostrar uma página vazia.
 */
export function Assinatura() {
  const { data: me } = useAuthMe();
  const ehAdministradora = me?.role === 'admin';

  // A query mora num hook porque o menu também a consome, para o ponto de
  // aviso — assim a faixa daqui e o ponto de lá nunca discordam.
  const query = useMinhaAssinatura();
  const dados = query.data;

  return (
    <PageShell
      eyebrow="Plataforma"
      title="Assinatura"
      description="O que você paga pelo Chegou, e como esse valor é calculado."
      icon={Receipt}
    >
      <div className="space-y-6">

      {query.isLoading || !me ? (
        <CarregandoAssinatura />
      ) : query.isError ? (
        <EmptyState
          icon={Info}
          title="Não foi possível carregar a assinatura"
          description="Tente novamente em instantes. Se continuar, fale com o suporte."
        />
      ) : dados?.conta === null ? (
        <CobrancaEhDaAdministradora nome={dados.responsavel?.nome ?? 'sua administradora'} />
      ) : dados ? (
        <>
          {dados.aviso && <AvisoVencimentoFaixa aviso={dados.aviso} />}
          <ContaAtual dados={dados} ehAdministradora={ehAdministradora} />
          <HistoricoFaturas faturas={dados.faturas} />
        </>
      ) : null}
      </div>
    </PageShell>
  );
}

function CarregandoAssinatura() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

/**
 * O condomínio está numa carteira: quem paga é a administradora.
 *
 * Sem esta tela o síndico veria uma página vazia e abriria chamado achando que
 * o sistema perdeu a fatura dele.
 */
function CobrancaEhDaAdministradora({ nome }: { nome: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Briefcase className="h-7 w-7" />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="txt-secao font-semibold text-foreground">
            A cobrança é com a sua administradora
          </h2>
          <p className="txt-apoio text-muted-foreground">
            Este condomínio faz parte da carteira de <strong>{nome}</strong>. A assinatura do
            Chegou é faturada diretamente para ela, junto com os demais condomínios que administra
            — por isso não existe cobrança separada aqui.
          </p>
          <p className="txt-apoio text-muted-foreground">
            Dúvidas sobre valores ou pagamento? Fale com a administradora.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ContaAtual({
  dados,
  ehAdministradora,
}: {
  dados: MinhaAssinatura;
  ehAdministradora: boolean;
}) {
  const conta = dados.conta!;
  const { resultado, condicao } = conta;

  // A próxima a vencer entre as que ainda esperam pagamento.
  const emAberto = dados.faturas
    .filter((f) => f.status === 'aberta' || f.status === 'vencida')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const proxima = emAberto[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Valor deste mês"
          value={fmtMoeda(resultado.valor)}
          icon={Wallet}
          variant="primary"
          description={MODO_LABEL[resultado.modo]}
        />
        <StatCard
          title={ehAdministradora ? 'Apartamentos da carteira' : 'Apartamentos ativos'}
          value={resultado.quantidadeApartamentos}
          icon={Building2}
          description={
            resultado.precoAplicado !== null
              ? `${fmtMoeda(resultado.precoAplicado)} por apartamento`
              : 'Valor fixo, sem contagem'
          }
        />
        <StatCard
          title="Em aberto"
          value={fmtMoeda(emAberto.reduce((soma, f) => soma + f.valor, 0))}
          icon={CalendarClock}
          variant={emAberto.some((f) => f.status === 'vencida') ? 'danger' : 'default'}
          description={
            proxima
              ? `Próximo vencimento em ${fmtData(proxima.vencimento)}`
              : 'Nada pendente por aqui'
          }
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h2 className="txt-subtitulo font-semibold text-foreground">Como chegamos nesse valor</h2>
            <div className="mt-2">
              <ComoFoiCalculado resultado={resultado} />
            </div>
          </div>

          {condicao && (
            <div className="rounded-lg bg-muted p-4">
              <p className="txt-corpo font-medium text-foreground">Você tem um preço especial</p>
              <p className="mt-1 txt-apoio text-muted-foreground">
                {MODO_LABEL[condicao.modo]}
                {condicao.descontoPercentual
                  ? ` · desconto de ${condicao.descontoPercentual}%`
                  : ''}
                {condicao.observacao ? ` — ${condicao.observacao}` : ''}
              </p>
            </div>
          )}

          {ehAdministradora && resultado.itens.length > 0 && (
            <div>
              <h3 className="txt-subtitulo font-semibold text-foreground">
                Composição por condomínio
              </h3>
              <p className="mt-1 txt-apoio text-muted-foreground">
                O total da carteira define a faixa de preço — por isso o valor por apartamento cai
                conforme ela cresce.
              </p>
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {resultado.itens.map((item) => (
                  <li
                    key={item.tenantId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate txt-corpo font-medium text-foreground">{item.nome}</p>
                      <p className="txt-apoio text-muted-foreground">
                        {item.apartamentos} apartamento{item.apartamentos === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono txt-corpo tabular text-foreground">
                      {fmtMoeda(item.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * O que a fatura oferece ao cliente, conforme o estado da cobrança.
 *
 * **Só a situação `pagavel` vira botão.** As outras viram texto — mostrar
 * "Pagar" numa fatura sem link seria oferecer uma ação que não acontece, e a
 * reação a isso é abrir chamado no suporte.
 *
 * O link abre em aba nova (`_blank` + `noopener`): é a tela do gateway, e
 * trocar a aba do painel por ela faria o cliente perder o que estava vendo.
 */
function BotaoPagar({ fatura }: { fatura: AssinaturaFatura }) {
  const { situacao, linkPagamento } = fatura.pagamento;

  if (situacao === 'sem_pendencia') return null;

  if (situacao === 'pagavel' && linkPagamento) {
    return (
      <Button asChild size="sm" className="rounded-full">
        <a href={linkPagamento} target="_blank" rel="noopener noreferrer">
          <CreditCard className="mr-2 h-4 w-4" />
          Pagar
        </a>
      </Button>
    );
  }

  return (
    <span className="max-w-40 txt-nota text-muted-foreground">
      {situacao === 'preparando'
        ? 'Preparando a cobrança…'
        : 'Link indisponível — fale com o suporte'}
    </span>
  );
}

function HistoricoFaturas({ faturas }: { faturas: AssinaturaFatura[] }) {
  if (faturas.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma fatura emitida ainda"
        description="Assim que a primeira competência for fechada, ela aparece aqui com o valor e o vencimento."
      />
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="txt-subtitulo font-semibold text-foreground">Faturas</h2>
      {/* Cards no celular, não tabela: em 375px uma tabela financeira ou corta
          coluna ou vira rolagem horizontal. */}
      <div className="space-y-3">
        {faturas.map((fatura) => (
          <Card key={fatura.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {fmtCompetencia(fatura.competencia)}
                  </span>
                  <StatusFaturaBadge status={fatura.status} />
                </div>
                <p className="txt-apoio text-muted-foreground">
                  Vence em {fmtData(fatura.vencimento)}
                  {fatura.status === 'paga' && fatura.pagaEm
                    ? ` · paga em ${fmtData(fatura.pagaEm.slice(0, 10))}`
                    : ''}
                </p>
                <p className="txt-apoio text-muted-foreground">
                  {fatura.quantidadeApartamentos} apartamento
                  {fatura.quantidadeApartamentos === 1 ? '' : 's'}
                  {fatura.precoAplicado !== null
                    ? ` × ${fmtMoeda(fatura.precoAplicado)}`
                    : ' · valor fixo'}
                  {fatura.desconto > 0 ? ` · desconto de ${fmtMoeda(fatura.desconto)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono txt-numero-sm font-bold tabular text-foreground">
                  {fmtMoeda(fatura.valor)}
                </span>
                <BotaoPagar fatura={fatura} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
