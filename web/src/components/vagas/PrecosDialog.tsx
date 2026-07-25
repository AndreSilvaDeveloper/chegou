import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { TipoVaga, VagaPreco } from '@/api/types';
import { FormDialog } from '@/components/ui/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { TIPO_VAGA_ICON, TIPO_VAGA_LABEL } from './vagas-shared';

const TIPOS: TipoVaga[] = ['carro', 'moto', 'grande', 'pcd'];

/** Valor por tipo como texto — vazio significa "não cobro por este tipo". */
type FormState = Record<TipoVaga, string>;

const VAZIO: FormState = { carro: '', moto: '', grande: '', pcd: '' };

export function PrecosDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(VAZIO);
  const queryClient = useQueryClient();

  const precosQuery = useQuery({
    queryKey: ['vagas-precos'],
    queryFn: () => api.get<VagaPreco[]>('/vagas-precos'),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !precosQuery.data) return;
    const preenchido = { ...VAZIO };
    for (const preco of precosQuery.data) preenchido[preco.tipo] = String(preco.valorMensal);
    setForm(preenchido);
  }, [open, precosQuery.data]);

  const salvar = useMutation({
    mutationFn: (dados: FormState) =>
      api.put<VagaPreco[]>('/vagas-precos', {
        precos: TIPOS.filter((t) => dados[t].trim() !== '').map((t) => ({
          tipo: t,
          valorMensal: Number(dados[t]),
        })),
      }),
    onSuccess: () => {
      toast.success('Tabela de preços salva.');
      queryClient.invalidateQueries({ queryKey: ['vagas-precos'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível salvar a tabela'));
    },
  });

  const submit = () => {
    const invalido = TIPOS.find((t) => form[t].trim() !== '' && Number(form[t]) < 0);
    if (invalido) {
      toast.error(`Valor inválido para ${TIPO_VAGA_LABEL[invalido].toLowerCase()}`);
      return;
    }
    salvar.mutate(form);
  };

  const carregando = precosQuery.isLoading;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tabela de preços"
      description="Valor mensal sugerido por tipo de vaga. Serve só de sugestão ao criar a locação — o valor cobrado é o que ficar gravado no contrato."
      submitLabel="Salvar tabela"
      saving={salvar.isPending}
      onSubmit={submit}
      hideFooter={carregando}
    >
      {carregando ? (
        <div className="space-y-3">
          {TIPOS.map((t) => (
            <Skeleton key={t} className="h-[76px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {TIPOS.map((tipo) => {
            const Icone = TIPO_VAGA_ICON[tipo];
            return (
              <div key={tipo} className="space-y-2">
                <Label htmlFor={`preco-${tipo}`} className="flex items-center gap-2 text-base">
                  <Icone className="h-4 w-4 text-muted-foreground" />
                  {TIPO_VAGA_LABEL[tipo]}
                </Label>
                <Input
                  id={`preco-${tipo}`}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={form[tipo]}
                  onChange={(e) => setForm({ ...form, [tipo]: e.target.value })}
                  placeholder="Sem preço definido"
                />
              </div>
            );
          })}

          <p className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-700 dark:text-sky-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Deixe em branco o tipo que o condomínio não aluga — ele sai da tabela.
          </p>
        </>
      )}
    </FormDialog>
  );
}
