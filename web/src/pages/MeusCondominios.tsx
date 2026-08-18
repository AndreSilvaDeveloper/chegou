import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CondominioNaCarteira, ResumoDaCarteira } from '@/api/types';
import { PageShell } from '@/components/ui/page-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ListCard } from '@/components/ui/list-card';
import { StatCard } from '@/components/ui/stat-card';
import { CondominioWizard } from '@/components/condominio/CondominioWizard';
import { camposDoResumo, variacaoMensal } from '@/components/condominio/condominio-numeros';
import { AvisoVencimentoFaixa } from '@/components/assinatura/assinatura-shared';
import {
  Building2,
  Clock,
  DoorClosed,
  LogIn,
  Package,
  Plus,
  Receipt,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthMe, useCondominioAtivo, useTrocarCondominio } from '@/hooks/use-tenant-config';
import { municipioLinha } from '@/lib/endereco';
import { mensagemErro } from '@/lib/erros';
import { fmtMoeda } from '@/lib/formato';

/**
 * A carteira da administradora — a tela onde ela **decide** em qual condomínio
 * entrar, e por isso precisa saber o que está acontecendo em cada um.
 *
 * Antes ela mostrava só nome, cidade e dois botões: para descobrir se um
 * condomínio estava vivo era preciso entrar nele, olhar o dashboard e voltar.
 * Agora cada card traz unidades, moradores, encomendas do mês, o que está
 * parado na portaria, o estado do WhatsApp e quanto aquele condomínio soma na
 * conta dela — vindos de `GET /minha-administradora/resumo`, **uma** chamada
 * para a carteira inteira.
 *
 * As duas ações continuam explícitas no pé de cada card. É o que a
 * administradora tem de autonomia, e escondê-las atrás de um menu de ícone
 * tornaria a tela mais limpa e menos útil — é a exceção que o `rodape` do
 * `ListCard` documenta.
 */
export function MeusCondominios() {
  const [novoAberto, setNovoAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trocarCondominio = useTrocarCondominio();
  const ativo = useCondominioAtivo();
  const { data: usuario } = useAuthMe();

  const resumoQuery = useQuery({
    queryKey: ['minha-administradora', 'resumo'],
    queryFn: () => api.get<ResumoDaCarteira>('/minha-administradora/resumo'),
  });

  const resumo = resumoQuery.data;
  const condominios = resumo?.condominios ?? [];

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return condominios;
    return condominios.filter(
      (c) =>
        c.tenant.nome.toLowerCase().includes(termo) ||
        (c.tenant.cidade ?? '').toLowerCase().includes(termo),
    );
  }, [condominios, busca]);

  const entrar = (c: CondominioNaCarteira) => {
    trocarCondominio(c.tenant.id);
    toast.success(`Você está em ${c.tenant.nome}.`);
    navigate('/dashboard');
  };

  /**
   * Configurar entra no condomínio antes de navegar.
   *
   * A tela de configuração usa as rotas normais do condomínio (`X-Tenant-Id`),
   * então o condomínio precisa já estar escolhido quando ela montar. Ela também
   * se vira sozinha se alguém abrir o link direto — aqui é só para não piscar.
   */
  const configurar = (c: CondominioNaCarteira) => {
    if (ativo.id !== c.tenant.id) trocarCondominio(c.tenant.id);
    navigate(`/meus-condominios/${c.tenant.id}`);
  };

  const totais = resumo?.totais;
  const variacao = totais
    ? variacaoMensal(totais.encomendasMes, totais.encomendasMesAnterior)
    : null;

  return (
    <PageShell
      icon={Building2}
      eyebrow="Administradora"
      title={resumo?.administradora.nome ?? usuario?.administradoraNome ?? 'Meus condomínios'}
      description={
        totais
          ? `${totais.condominios} condomínio(s) · ${totais.condominiosAtivos} ativo(s) · ${totais.apartamentos} unidade(s)`
          : 'A sua carteira de condomínios'
      }
      busca={
        condominios.length > 4
          ? { valor: busca, aoMudar: setBusca, placeholder: 'Buscar condomínio ou cidade…' }
          : undefined
      }
      acoes={
        <Button onClick={() => setNovoAberto(true)} className="flex-1 rounded-full sm:flex-none">
          <Plus className="mr-2 h-4 w-4" />
          Novo condomínio
        </Button>
      }
    >
      <div className="space-y-6">
        {resumoQuery.isError ? (
          <EmptyState
            icon={Building2}
            title="Não foi possível carregar a carteira"
            description={mensagemErro(resumoQuery.error, 'Tente de novo em instantes.')}
            actionLabel="Tentar de novo"
            onAction={() => resumoQuery.refetch()}
          />
        ) : resumoQuery.isLoading ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-[116px] rounded-surface" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[320px] rounded-surface" />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ---------------- A carteira em números ---------------- */}
            {totais && condominios.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Condomínios"
                  value={totais.condominios}
                  icon={Building2}
                  description={`${totais.condominiosAtivos} ativo(s) · ${totais.whatsappConectados} com WhatsApp conectado`}
                />
                <StatCard
                  title="Unidades"
                  value={totais.apartamentos}
                  icon={DoorClosed}
                  description={`${totais.moradores} morador(es) cadastrado(s)`}
                />
                <StatCard
                  title="Encomendas no mês"
                  value={totais.encomendasMes}
                  icon={Package}
                  variant="info"
                  trend={
                    variacao != null ? { value: variacao, label: 'vs. mês anterior' } : undefined
                  }
                />
                <StatCard
                  title="Aguardando retirada"
                  value={totais.aguardando}
                  icon={Clock}
                  variant="warning"
                  description="Em toda a carteira, agora"
                />
              </div>
            )}

            {/* ---------------- A conta da carteira ---------------- */}
            {resumo?.assinatura && (
              <div className="space-y-3">
                {resumo.assinatura.aviso && (
                  <AvisoVencimentoFaixa aviso={resumo.assinatura.aviso} />
                )}
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                    >
                      <Receipt className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="eyebrow">Sua assinatura</p>
                      <p className="mt-1 txt-subtitulo font-semibold">
                        <span className="tabular">
                          {fmtMoeda(resumo.assinatura.valorMensal)}
                        </span>
                        <span className="txt-apoio font-normal text-muted-foreground">
                          {' '}
                          por mês
                        </span>
                      </p>
                      <p className="txt-apoio text-muted-foreground">
                        {resumo.assinatura.apartamentosCobrados} unidade(s) na conta da carteira
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" asChild className="rounded-full">
                    <Link to="/assinatura">Ver a conta</Link>
                  </Button>
                </Card>
              </div>
            )}

            {/* ---------------- Um card por condomínio ---------------- */}
            {condominios.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nenhum condomínio na carteira"
                description="Cadastre o primeiro condomínio que a sua administradora gerencia."
                actionLabel="Cadastrar condomínio"
                onAction={() => setNovoAberto(true)}
              />
            ) : filtrados.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nenhum condomínio encontrado"
                description={`Nada na carteira corresponde a "${busca}".`}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtrados.map((c) => {
                  const estaAtivo = ativo.id === c.tenant.id;
                  return (
                    <ListCard
                      key={c.tenant.id}
                      icone={Building2}
                      titulo={c.tenant.nome}
                      subtitulo={municipioLinha(c.tenant) || 'Sem cidade informada'}
                      atenuado={!c.tenant.ativo}
                      selo={
                        estaAtivo ? (
                          <Badge variant="success">Em uso</Badge>
                        ) : (
                          <Badge variant={c.tenant.ativo ? 'outline' : 'secondary'}>
                            {c.tenant.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        )
                      }
                      campos={camposDoResumo(c.resumo, c.assinaturaSubtotal)}
                      rodape={
                        <>
                          <Button
                            variant={estaAtivo ? 'outline' : 'default'}
                            onClick={() => entrar(c)}
                            disabled={!c.tenant.ativo}
                            className="flex-1"
                          >
                            <LogIn className="mr-2 h-4 w-4" />
                            {estaAtivo ? 'Continuar aqui' : 'Entrar'}
                          </Button>
                          {/* Configurar fica disponível mesmo com o condomínio
                              inativo: é onde ela confere o cadastro e lê que a
                              reativação é com a plataforma. */}
                          <Button
                            variant="outline"
                            onClick={() => configurar(c)}
                            className="flex-1"
                          >
                            <Settings2 className="mr-2 h-4 w-4" />
                            Configurar
                          </Button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        <CondominioWizard
          open={novoAberto}
          onOpenChange={setNovoAberto}
          endpoint="/minha-administradora/condominios"
          onCriado={() => queryClient.invalidateQueries({ queryKey: ['minha-administradora'] })}
        />
      </div>
    </PageShell>
  );
}
