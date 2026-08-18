import { Clock, DoorClosed, MessageCircle, Package, Receipt, Timer, Users } from 'lucide-react';
import type {
  ParticipacaoAtual,
  ResumoCondominio,
  ResumoWhatsappCondominio,
} from '@/api/types';
import type { CampoListCard } from '@/components/ui/list-card';
import { StatCard } from '@/components/ui/stat-card';
import { StatusDot, type Tone } from '@/components/ui/status-dot';
import { fmtMoeda } from '@/lib/formato';

/**
 * O condomínio em números — a mesma leitura em toda tela que o olha **de fora**.
 *
 * Duas telas usam isto: a carteira da administradora (`/meus-condominios`), onde
 * cada condomínio é um card, e a tela do condomínio no superadmin
 * (`/admin/condominios/:id`), onde ele vira uma faixa de indicadores. As duas
 * leem a mesma resposta do servidor e os mesmos rótulos — foi assim que os
 * status da encomenda pararam de divergir entre listagem e detalhe, e aqui é a
 * mesma aposta.
 *
 * Regra que vale para tudo daqui: **nada de âmbar decorativo**. Estes números
 * são leitura; a ação (entrar, configurar) é que fica âmbar, e dois âmbares na
 * mesma dobra fazem o botão deixar de saltar.
 */

// ---------------------------------------------------------------- WhatsApp

interface EstadoWhatsapp {
  tone: Tone;
  label: string;
}

/**
 * O status cru da sessão OpenWA, traduzido.
 *
 * `null` é o caso mais comum numa carteira nova — condomínio cadastrado e
 * WhatsApp ainda não pareado — e por isso tem texto próprio: "desconectado"
 * soaria como falha onde o certo é "ainda não configuraram".
 */
export function estadoWhatsapp(status: string | null): EstadoWhatsapp {
  switch (status) {
    case 'ready':
      return { tone: 'done', label: 'Conectado' };
    case 'qr_ready':
      return { tone: 'waiting', label: 'Aguardando leitura do QR' };
    case 'initializing':
    case 'authenticating':
      return { tone: 'notified', label: 'Conectando' };
    case 'failed':
      return { tone: 'danger', label: 'Falhou' };
    case 'disconnected':
      return { tone: 'danger', label: 'Desconectado' };
    case null:
      return { tone: 'neutral', label: 'Nunca conectado' };
    default:
      return { tone: 'neutral', label: 'Sem informação' };
  }
}

/** Estado da sessão + o que saiu nos últimos 7 dias, numa linha. */
export function WhatsappResumo({ whatsapp }: { whatsapp: ResumoWhatsappCondominio }) {
  const { tone, label } = estadoWhatsapp(whatsapp.status);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusDot tone={tone} label={label} />
      <span className="txt-apoio text-muted-foreground">
        {whatsapp.enviadas7d} envio(s) em 7 dias
        {whatsapp.falhas7d > 0 && ` · ${whatsapp.falhas7d} falha(s)`}
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ números

/** Variação percentual contra o mês anterior. `null` quando não há com o que comparar. */
export function variacaoMensal(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/**
 * Cobertura de WhatsApp: quantos moradores o condomínio realmente alcança.
 *
 * É o número que explica notificação que "não chegou" — sem telefone ou com o
 * recebimento desligado, o morador nunca entra na fila.
 */
export function coberturaWhatsapp(resumo: ResumoCondominio): number | null {
  if (resumo.moradores === 0) return null;
  return Math.round((resumo.moradoresComWhatsapp / resumo.moradores) * 100);
}

/** Horas em texto curto: `3h`, `1h30`, `2 dias`. */
export function fmtHoras(horas: number | null): string {
  if (horas == null) return '—';
  if (horas >= 48) return `${Math.round(horas / 24)} dias`;
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`;
}

/**
 * Os campos do condomínio no formato do `ListCard` — a versão da carteira.
 *
 * A ênfase fica em "encomendas no mês" porque é o número que responde à
 * pergunta que traz a administradora a esta tela: este condomínio está sendo
 * usado? Unidade e morador dizem se ele foi *implantado*; encomenda diz se ele
 * está *vivo*.
 */
export function camposDoResumo(
  resumo: ResumoCondominio,
  assinaturaSubtotal: number | null,
): CampoListCard[] {
  const variacao = variacaoMensal(resumo.encomendasMes, resumo.encomendasMesAnterior);
  const cobertura = coberturaWhatsapp(resumo);

  return [
    {
      rotulo: 'Unidades',
      icone: DoorClosed,
      valor: <span className="tabular">{resumo.apartamentos}</span>,
    },
    {
      rotulo: 'Moradores',
      icone: Users,
      valor: (
        <span className="tabular">
          {resumo.moradores}
          {cobertura != null && (
            <span className="text-muted-foreground"> · {cobertura}% no WhatsApp</span>
          )}
        </span>
      ),
    },
    {
      rotulo: 'Encomendas no mês',
      icone: Package,
      enfase: true,
      valor: (
        <span className="tabular">
          {resumo.encomendasMes}
          {variacao != null && (
            <span className="txt-nota font-normal text-muted-foreground">
              {' '}
              {variacao >= 0 ? '+' : ''}
              {variacao}% vs. mês anterior
            </span>
          )}
        </span>
      ),
    },
    {
      rotulo: 'Aguardando retirada',
      icone: Clock,
      valor: <span className="tabular">{resumo.aguardando}</span>,
    },
    {
      rotulo: 'Tempo médio de retirada',
      icone: Timer,
      valor: fmtHoras(resumo.tempoMedioHoras),
    },
    {
      rotulo: 'Na sua conta',
      icone: Receipt,
      valor:
        assinaturaSubtotal == null ? (
          <span className="text-muted-foreground">Fora do cálculo</span>
        ) : (
          <span className="tabular">{fmtMoeda(assinaturaSubtotal)}/mês</span>
        ),
    },
    {
      rotulo: 'WhatsApp',
      icone: MessageCircle,
      largura: 'inteira',
      valor: <WhatsappResumo whatsapp={resumo.whatsapp} />,
    },
  ];
}

/**
 * A versão em faixa de indicadores — a tela do condomínio no superadmin.
 *
 * As variantes seguem o significado, como no dashboard: recebidas é `info` (o
 * azul da série de entrada), aguardando é `warning`. Nada de dois âmbares.
 */
export function NumerosDoCondominio({
  resumo,
  participacao,
}: {
  resumo: ResumoCondominio;
  participacao?: ParticipacaoAtual | null;
}) {
  const variacao = variacaoMensal(resumo.encomendasMes, resumo.encomendasMesAnterior);
  const cobertura = coberturaWhatsapp(resumo);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Unidades"
          value={resumo.apartamentos}
          icon={DoorClosed}
          description={`${resumo.moradores} morador(es)${
            cobertura != null ? ` · ${cobertura}% no WhatsApp` : ''
          }`}
        />
        <StatCard
          title="Encomendas no mês"
          value={resumo.encomendasMes}
          icon={Package}
          variant="info"
          trend={variacao != null ? { value: variacao, label: 'vs. mês anterior' } : undefined}
        />
        <StatCard
          title="Aguardando retirada"
          value={resumo.aguardando}
          icon={Clock}
          variant="warning"
          description={`Tempo médio: ${fmtHoras(resumo.tempoMedioHoras)}`}
        />
        <StatCard
          title="Na conta de quem paga"
          value={participacao ? fmtMoeda(participacao.subtotal) : '—'}
          icon={Receipt}
          description={
            participacao
              ? `${participacao.apartamentos} unidade(s) cobrada(s)`
              : 'Fora do cálculo da assinatura'
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted px-4 py-3">
        <span className="eyebrow">WhatsApp</span>
        <WhatsappResumo whatsapp={resumo.whatsapp} />
        {resumo.whatsapp.numero && (
          <span className="font-mono txt-nota text-muted-foreground">{resumo.whatsapp.numero}</span>
        )}
      </div>
    </div>
  );
}
