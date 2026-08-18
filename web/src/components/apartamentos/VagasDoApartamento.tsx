import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { TipoVaga, Vaga } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Plus, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { TIPO_VAGA_LABEL } from '@/components/vagas/vagas-shared';

const TIPOS: TipoVaga[] = ['carro', 'moto', 'grande', 'pcd'];

export interface NovaVaga {
  numero: string;
  tipo: TipoVaga;
  localizacao?: string;
}

export interface VagasSelecionadas {
  novasVagas: NovaVaga[];
  vagasExistentesIds: string[];
}

export const VAGAS_VAZIO: VagasSelecionadas = { novasVagas: [], vagasExistentesIds: [] };

/** Uma vaga já presa à unidade (ou na fila para ser, no cadastro). */
interface LinhaVaga {
  chave: string;
  numero: string;
  tipo?: TipoVaga;
  selo?: 'nova' | 'inativa';
  remover: () => void;
  rotuloRemover: string;
  iconeRemover: typeof X;
}

/**
 * Vagas que pertencem à unidade.
 *
 * A vaga vinculada é **do apartamento**: o morador vai embora e ela fica com a
 * unidade. Diferente da locação, que é da pessoa que aluga — por isso vaga com
 * contrato vigente não aparece aqui para vincular.
 *
 * DESENHO — por que isto não é um card com dois formulários abertos
 *
 * A maior parte dos apartamentos é cadastrada **sem** mexer em vaga, e mesmo
 * assim o bloco ocupava metade do diálogo com dois formulários prontos que
 * ninguém ia usar. Aqui o estado de repouso é uma linha: o que já está
 * vinculado, e um botão. O formulário só existe depois do clique, e as duas
 * formas de vincular (criar uma vaga nova / pegar uma livre) viram abas — são
 * conteúdos diferentes, então `Tabs`, não `SegmentedFilter`.
 */
export function VagasDoApartamento({
  apartamentoId,
  valor,
  onChange,
}: {
  /** Nulo enquanto o apartamento ainda não existe (cadastro). */
  apartamentoId: string | null;
  /** Estado controlado — só no modo cadastro. */
  valor?: VagasSelecionadas;
  onChange?: (valor: VagasSelecionadas) => void;
}) {
  const modoCadastro = !apartamentoId;
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<'existente' | 'nova'>('nova');
  const [nova, setNova] = useState<NovaVaga>({ numero: '', tipo: 'carro' });
  const [selecionada, setSelecionada] = useState('');
  const queryClient = useQueryClient();

  const disponiveisQuery = useQuery({
    queryKey: ['vagas-disponiveis'],
    queryFn: () => api.get<Vaga[]>('/vagas/disponiveis'),
  });

  const vinculadasQuery = useQuery({
    queryKey: ['apartamento-vagas', apartamentoId],
    queryFn: () => api.get<Vaga[]>(`/apartamentos/${apartamentoId}/vagas`),
    enabled: !!apartamentoId,
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['apartamento-vagas'] });
    queryClient.invalidateQueries({ queryKey: ['vagas-disponiveis'] });
    queryClient.invalidateQueries({ queryKey: ['vagas'] });
  };

  const fechar = () => {
    setAberto(false);
    setNova({ numero: '', tipo: 'carro' });
    setSelecionada('');
  };

  const adicionar = useMutation({
    mutationFn: (dados: Partial<VagasSelecionadas>) =>
      api.post<Vaga[]>(`/apartamentos/${apartamentoId}/vagas`, dados),
    onSuccess: () => {
      toast.success('Vaga vinculada à unidade.');
      fechar();
      invalidar();
    },
    onError: (err: unknown) => toast.error(mensagemErro(err, 'Não foi possível vincular a vaga')),
  });

  const desvincular = useMutation({
    mutationFn: (vagaId: string) =>
      api.delete<Vaga>(`/apartamentos/${apartamentoId}/vagas/${vagaId}`),
    onSuccess: () => {
      toast.success('Vaga desvinculada — voltou a ficar disponível para locação.');
      invalidar();
    },
    onError: (err: unknown) => toast.error(mensagemErro(err, 'Não foi possível desvincular')),
  });

  const atual = valor ?? VAGAS_VAZIO;
  const disponiveis = disponiveisQuery.data ?? [];
  const naoSelecionadas = disponiveis.filter((v) => !atual.vagasExistentesIds.includes(v.id));
  const vinculadas = vinculadasQuery.data ?? [];
  const salvando = adicionar.isPending || desvincular.isPending;

  const abrir = () => {
    // Abre já na aba que resolve o caso do usuário: havendo vaga livre, vincular
    // é o caminho curto; sem nenhuma, o único caminho é criar.
    setModo(naoSelecionadas.length > 0 ? 'existente' : 'nova');
    setAberto(true);
  };

  const adicionarNova = () => {
    if (!nova.numero.trim()) return toast.error('Informe o número da vaga');
    if (modoCadastro) {
      onChange?.({
        ...atual,
        novasVagas: [...atual.novasVagas, { ...nova, numero: nova.numero.trim() }],
      });
      fechar();
    } else {
      adicionar.mutate({ novasVagas: [{ ...nova, numero: nova.numero.trim() }] });
    }
  };

  const vincularExistente = () => {
    if (!selecionada) return;
    if (modoCadastro) {
      onChange?.({ ...atual, vagasExistentesIds: [...atual.vagasExistentesIds, selecionada] });
      fechar();
    } else {
      adicionar.mutate({ vagasExistentesIds: [selecionada] });
    }
  };

  // Uma lista só: no cadastro é a fila do que vai ser criado/vinculado ao
  // salvar; na edição é o que já está vinculado. Duas listas com a mesma cara
  // eram duas anatomias para manter em dia.
  const linhas: LinhaVaga[] = modoCadastro
    ? [
        ...atual.novasVagas.map((v, i) => ({
          chave: `nova-${i}`,
          numero: v.numero,
          tipo: v.tipo,
          selo: 'nova' as const,
          rotuloRemover: `Remover vaga ${v.numero}`,
          iconeRemover: X,
          remover: () =>
            onChange?.({ ...atual, novasVagas: atual.novasVagas.filter((_, idx) => idx !== i) }),
        })),
        ...atual.vagasExistentesIds.map((id) => {
          const vaga = disponiveis.find((v) => v.id === id);
          return {
            chave: id,
            numero: vaga?.numero ?? 'Vaga',
            tipo: vaga?.tipo,
            rotuloRemover: `Remover vaga ${vaga?.numero ?? ''} da lista`,
            iconeRemover: X,
            remover: () =>
              onChange?.({
                ...atual,
                vagasExistentesIds: atual.vagasExistentesIds.filter((v) => v !== id),
              }),
          };
        }),
      ]
    : vinculadas.map((vaga) => ({
        chave: vaga.id,
        numero: vaga.numero,
        tipo: vaga.tipo,
        selo: vaga.ativo ? undefined : ('inativa' as const),
        rotuloRemover: `Desvincular vaga ${vaga.numero}`,
        iconeRemover: Unlink,
        remover: () => desvincular.mutate(vaga.id),
      }));

  return (
    <div className="space-y-2 flex flex-col">
      {linhas.length > 0 && (
        <ul className="space-y-1.5">
          {linhas.map((linha) => {
            const IconeRemover = linha.iconeRemover;
            return (
              <li
                key={linha.chave}
                className="flex items-center gap-2 rounded-lg bg-muted py-1.5 pl-3 pr-1.5"
              >
                <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="txt-corpo font-mono font-semibold text-foreground">
                  {linha.numero}
                </span>
                {linha.tipo && (
                  <span className="txt-apoio truncate text-muted-foreground">
                    {TIPO_VAGA_LABEL[linha.tipo]}
                  </span>
                )}
                {linha.selo === 'nova' && <Badge variant="info">Nova</Badge>}
                {linha.selo === 'inativa' && <Badge variant="secondary">Inativa</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto shrink-0 text-muted-foreground"
                  aria-label={linha.rotuloRemover}
                  onClick={linha.remover}
                  disabled={salvando}
                >
                  <IconeRemover />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Vagas de garagem</Label>
        </div>
        <div>
          {!aberto ? (
            
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={abrir}
                className="w-full sm:w-auto"
              >
                <Plus />
                Vincular vaga
              </Button>
            </div>
            
          ):(
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-1 text-muted-foreground"
              aria-label="Fechar"
              onClick={fechar}
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      
      

      {aberto && (<div className="space-y-3 rounded-lg ">
          {/* <div className="flex items-center justify-between gap-2">
            <p className="txt-subtitulo font-semibold text-foreground">Vincular vaga</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-1 text-muted-foreground"
              aria-label="Fechar"
              onClick={fechar}
            >
              <X />
            </Button>
          </div> */}

          <Tabs value={modo} onValueChange={(v) => setModo(v as 'existente' | 'nova')}>
            {/* Sem vaga livre a aba "já cadastrada" só teria um select vazio. */}
            {naoSelecionadas.length > 0 && (
              <TabsList>
                <TabsTrigger value="existente">Já cadastrada</TabsTrigger>
                <TabsTrigger value="nova">Criar nova</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="existente" className="space-y-2">
              <SimpleSelect
                id="vaga-existente"
                aria-label="Vaga livre do condomínio"
                value={selecionada}
                onValueChange={setSelecionada}
                placeholder="Vagas livres do condomínio"
                options={naoSelecionadas.map((v) => ({
                  value: v.id,
                  label: `${v.numero} — ${TIPO_VAGA_LABEL[v.tipo]}`,
                  hint: v.localizacao ?? undefined,
                }))}
              />
              <Button
                type="button"
                onClick={vincularExistente}
                disabled={!selecionada}
                loading={salvando}
                className="w-full sm:w-auto"
              >
                Vincular
              </Button>
            </TabsContent>

            <TabsContent value="nova" className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input
                  id="vaga-numero-nova"
                  aria-label="Número da vaga"
                  value={nova.numero}
                  onChange={(e) => setNova({ ...nova, numero: e.target.value })}
                  placeholder="Número (ex: G-12)"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <SimpleSelect
                  aria-label="Tipo da vaga"
                  value={nova.tipo}
                  onValueChange={(v) => setNova({ ...nova, tipo: v as TipoVaga })}
                  options={TIPOS.map((t) => ({ value: t, label: TIPO_VAGA_LABEL[t] }))}
                />
                <Button
                  type="button"
                  onClick={adicionarNova}
                  loading={salvando}
                  className="w-9"
                >
                  <Plus/>
                  {/* Adicionar vaga */}
                </Button>
                </div>
              </div>
              
            </TabsContent>
          </Tabs>

          {/* {modoCadastro && (
            <small className=" text-muted-foreground">
              As vagas são criadas junto com a unidade quando você salvar.
            </small>
          )} */}
        </div>
      )}

      <div>
        {linhas.length === 0 && (
          <small className="text-muted-foreground">
            A vaga fica com o apartamento, não com o morador.
          </small>
        )}
      </div>
        {/* {!aberto ? (
          <div className="">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={abrir}
                className="w-full sm:w-auto"
              >
                <Plus />
                Vincular vaga
              </Button>
            </div>
            
          </div>
        ) : (
          
        )} */}
    </div>
  );
}
