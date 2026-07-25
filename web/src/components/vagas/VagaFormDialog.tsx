import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Apartamento, TipoVaga, Vaga } from '@/api/types';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { TIPO_VAGA_LABEL } from './vagas-shared';

const TIPOS: TipoVaga[] = ['carro', 'moto', 'grande', 'pcd'];

interface FormState {
  numero: string;
  tipo: TipoVaga;
  localizacao: string;
  apartamentoId: string;
  observacoes: string;
}

const VAZIO: FormState = {
  numero: '',
  tipo: 'carro',
  localizacao: '',
  apartamentoId: '',
  observacoes: '',
};

export function VagaFormDialog({
  open,
  onOpenChange,
  vaga,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preenchido = edição; nulo = criação. */
  vaga: Vaga | null;
}) {
  const [form, setForm] = useState<FormState>(VAZIO);
  const queryClient = useQueryClient();
  const editando = !!vaga;

  useEffect(() => {
    if (!open) return;
    setForm(
      vaga
        ? {
            numero: vaga.numero,
            tipo: vaga.tipo,
            localizacao: vaga.localizacao ?? '',
            apartamentoId: vaga.apartamentoId ?? '',
            observacoes: vaga.observacoes ?? '',
          }
        : VAZIO,
    );
  }, [open, vaga]);

  const apartamentosQuery = useQuery({
    queryKey: ['apartamentos'],
    queryFn: () => api.get<Apartamento[]>('/apartamentos'),
    enabled: open,
  });

  const salvar = useMutation({
    mutationFn: (dados: FormState) => {
      const payload = {
        numero: dados.numero.trim(),
        tipo: dados.tipo,
        localizacao: dados.localizacao.trim() || undefined,
        // String vazia significa "sem apartamento" — o backend espera null.
        apartamentoId: dados.apartamentoId || null,
        observacoes: dados.observacoes.trim() || undefined,
      };
      return vaga
        ? api.patch<Vaga>(`/vagas/${vaga.id}`, payload)
        : api.post<Vaga>('/vagas', payload);
    },
    onSuccess: () => {
      toast.success(editando ? 'Vaga atualizada.' : 'Vaga cadastrada.');
      queryClient.invalidateQueries({ queryKey: ['vagas'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível salvar a vaga'));
    },
  });

  const submit = () => {
    if (!form.numero.trim()) {
      toast.error('Informe o número da vaga');
      return;
    }
    salvar.mutate(form);
  };

  const opcoesApartamento = [
    { value: '', label: 'Nenhum — vaga livre para locação' },
    ...(apartamentosQuery.data ?? []).map((a) => ({
      value: a.id,
      label: a.identificador,
    })),
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editando ? `Editar vaga ${vaga.numero}` : 'Nova vaga'}
      description="Vaga vinculada a um apartamento é de uso da unidade. Só as vagas livres podem ser alugadas."
      submitLabel={editando ? 'Salvar alterações' : 'Cadastrar vaga'}
      saving={salvar.isPending}
      onSubmit={submit}
    >
      <div className="space-y-2">
        <Label htmlFor="vaga-numero" className="text-base">
          Número da vaga
        </Label>
        <Input
          id="vaga-numero"
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: e.target.value })}
          placeholder="G-01"
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vaga-tipo" className="text-base">
          Tipo de vaga
        </Label>
        <SimpleSelect
          id="vaga-tipo"
          value={form.tipo}
          onValueChange={(v) => setForm({ ...form, tipo: v as TipoVaga })}
          options={TIPOS.map((t) => ({ value: t, label: TIPO_VAGA_LABEL[t] }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vaga-local" className="text-base">
          Localização
        </Label>
        <Input
          id="vaga-local"
          value={form.localizacao}
          onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
          placeholder="Subsolo 1"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="vaga-apto" className="text-base">
          Apartamento vinculado
        </Label>
        <SimpleSelect
          id="vaga-apto"
          value={form.apartamentoId}
          onValueChange={(v) => setForm({ ...form, apartamentoId: v })}
          options={opcoesApartamento}
          placeholder="Nenhum — vaga livre para locação"
        />
        {form.apartamentoId && (
          <p className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Vinculada a um apartamento, esta vaga sai do pool de locação e não pode ser alugada.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vaga-obs" className="text-base">
          Observações
        </Label>
        <Textarea
          id="vaga-obs"
          value={form.observacoes}
          onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}
