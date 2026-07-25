import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { TipoVaga, Vaga } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Car, Info, Loader2, Plus, Unlink, X } from 'lucide-react';
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

/**
 * Vagas que pertencem à unidade.
 *
 * A vaga vinculada é **do apartamento**: o morador vai embora e ela fica com a
 * unidade. Diferente da locação, que é da pessoa que aluga — por isso vaga com
 * contrato vigente não aparece aqui para vincular.
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

  const adicionar = useMutation({
    mutationFn: (dados: Partial<VagasSelecionadas>) =>
      api.post<Vaga[]>(`/apartamentos/${apartamentoId}/vagas`, dados),
    onSuccess: () => {
      toast.success('Vaga vinculada à unidade.');
      setNova({ numero: '', tipo: 'carro' });
      setSelecionada('');
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

  // ----- modo cadastro: acumula no estado do formulário -----
  const atual = valor ?? VAGAS_VAZIO;
  const disponiveis = disponiveisQuery.data ?? [];
  const naoSelecionadas = disponiveis.filter((v) => !atual.vagasExistentesIds.includes(v.id));

  const adicionarNova = () => {
    if (!nova.numero.trim()) return toast.error('Informe o número da vaga');
    if (modoCadastro) {
      onChange?.({ ...atual, novasVagas: [...atual.novasVagas, { ...nova, numero: nova.numero.trim() }] });
      setNova({ numero: '', tipo: 'carro' });
    } else {
      adicionar.mutate({ novasVagas: [{ ...nova, numero: nova.numero.trim() }] });
    }
  };

  const vincularExistente = () => {
    if (!selecionada) return;
    if (modoCadastro) {
      onChange?.({ ...atual, vagasExistentesIds: [...atual.vagasExistentesIds, selecionada] });
      setSelecionada('');
    } else {
      adicionar.mutate({ vagasExistentesIds: [selecionada] });
    }
  };

  const vinculadas = vinculadasQuery.data ?? [];
  const salvando = adicionar.isPending || desvincular.isPending;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-2">
        <Car className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-base font-medium text-foreground">Vagas de garagem da unidade</p>
          <p className="text-sm text-muted-foreground">
            A vaga fica com o apartamento, não com o morador.
          </p>
        </div>
      </div>

      {/* Já vinculadas */}
      {!modoCadastro && vinculadas.length > 0 && (
        <ul className="space-y-2">
          {vinculadas.map((vaga) => (
            <li
              key={vaga.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground">{vaga.numero}</span>
                <Badge variant="outline">{TIPO_VAGA_LABEL[vaga.tipo]}</Badge>
                {!vaga.ativo && <Badge variant="secondary">Inativa</Badge>}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => desvincular.mutate(vaga.id)}
                disabled={salvando}
                className="min-h-[48px] w-full sm:w-auto"
              >
                <Unlink className="mr-2 h-4 w-4" />
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* A vincular (modo cadastro) */}
      {modoCadastro && (atual.novasVagas.length > 0 || atual.vagasExistentesIds.length > 0) && (
        <ul className="space-y-2">
          {atual.novasVagas.map((v, i) => (
            <li
              key={`nova-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground">{v.numero}</span>
                <Badge variant="outline">{TIPO_VAGA_LABEL[v.tipo]}</Badge>
                <Badge variant="info">Nova</Badge>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover vaga ${v.numero}`}
                onClick={() =>
                  onChange?.({ ...atual, novasVagas: atual.novasVagas.filter((_, idx) => idx !== i) })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {atual.vagasExistentesIds.map((id) => {
            const vaga = disponiveis.find((v) => v.id === id);
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-foreground">
                    {vaga?.numero ?? 'Vaga'}
                  </span>
                  {vaga && <Badge variant="outline">{TIPO_VAGA_LABEL[vaga.tipo]}</Badge>}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover vaga da lista"
                  onClick={() =>
                    onChange?.({
                      ...atual,
                      vagasExistentesIds: atual.vagasExistentesIds.filter((v) => v !== id),
                    })
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Vincular vaga já cadastrada */}
      {naoSelecionadas.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="vaga-existente" className="text-base">
            Vincular vaga já cadastrada
          </Label>
          <SimpleSelect
            id="vaga-existente"
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
            variant="outline"
            onClick={vincularExistente}
            disabled={!selecionada || salvando}
            className="min-h-[48px] w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Vincular vaga
          </Button>
        </div>
      )}

      {/* Cadastrar vaga nova */}
      <div className="space-y-2">
        <Label htmlFor="vaga-numero-nova" className="text-base">
          Cadastrar vaga nova
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            id="vaga-numero-nova"
            value={nova.numero}
            onChange={(e) => setNova({ ...nova, numero: e.target.value })}
            placeholder="Número (ex: G-12)"
          />
          <SimpleSelect
            value={nova.tipo}
            onValueChange={(v) => setNova({ ...nova, tipo: v as TipoVaga })}
            options={TIPOS.map((t) => ({ value: t, label: TIPO_VAGA_LABEL[t] }))}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={adicionarNova}
          disabled={salvando}
          className="min-h-[48px] w-full sm:w-auto"
        >
          {salvando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Adicionar vaga
        </Button>
      </div>

      {modoCadastro && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          As vagas são criadas junto com a unidade quando você salvar.
        </p>
      )}
    </div>
  );
}
