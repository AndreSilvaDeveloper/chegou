import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { LocatarioTipo, Morador, Vaga, VagaLocacao, VagaPreco } from '@/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SimpleSelect } from '@/components/ui/simple-select';
import { PhoneInput } from '@/components/ui/phone-input';
import { EmptyState } from '@/components/ui/empty-state';
import { Car, Info, Loader2, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { cn } from '@/lib/utils';
import { fmtMoeda, hojeLocal, TIPO_VAGA_LABEL } from './vagas-shared';

interface FormState {
  vagaId: string;
  locatarioTipo: LocatarioTipo;
  moradorId: string;
  locatarioNome: string;
  locatarioDocumento: string;
  locatarioTelefoneE164: string;
  locatarioEmail: string;
  valorMensal: string;
  diaVencimento: string;
  dataInicio: string;
  observacoes: string;
}

const vazio = (): FormState => ({
  vagaId: '',
  locatarioTipo: 'morador',
  moradorId: '',
  locatarioNome: '',
  locatarioDocumento: '',
  locatarioTelefoneE164: '',
  locatarioEmail: '',
  valorMensal: '',
  diaVencimento: '10',
  dataInicio: hojeLocal(),
  observacoes: '',
});

export function LocacaoFormDialog({
  open,
  onOpenChange,
  locacao,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preenchido = edição; nulo = nova locação. */
  locacao: VagaLocacao | null;
}) {
  const [form, setForm] = useState<FormState>(vazio);
  const queryClient = useQueryClient();
  const editando = !!locacao;

  // Na edição a vaga não muda: trocar de vaga exige encerrar e abrir outro contrato.
  const disponiveisQuery = useQuery({
    queryKey: ['vagas-disponiveis'],
    queryFn: () => api.get<Vaga[]>('/vagas/disponiveis'),
    enabled: open && !editando,
  });

  const moradoresQuery = useQuery({
    queryKey: ['moradores'],
    queryFn: () => api.get<Morador[]>('/moradores'),
    enabled: open,
  });

  const precosQuery = useQuery({
    queryKey: ['vagas-precos'],
    queryFn: () => api.get<VagaPreco[]>('/vagas-precos'),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      locacao
        ? {
            vagaId: locacao.vagaId,
            locatarioTipo: locacao.locatarioTipo,
            moradorId: locacao.moradorId ?? '',
            locatarioNome: locacao.locatarioNome ?? '',
            locatarioDocumento: locacao.locatarioDocumento ?? '',
            locatarioTelefoneE164: locacao.locatarioTelefoneE164 ?? '',
            locatarioEmail: locacao.locatarioEmail ?? '',
            valorMensal: String(locacao.valorMensal),
            diaVencimento: String(locacao.diaVencimento),
            dataInicio: locacao.dataInicio.slice(0, 10),
            observacoes: locacao.observacoes ?? '',
          }
        : vazio(),
    );
  }, [open, locacao]);

  const vagaSelecionada = useMemo(
    () => disponiveisQuery.data?.find((v) => v.id === form.vagaId) ?? null,
    [disponiveisQuery.data, form.vagaId],
  );

  // Escolher a vaga sugere o preço da tabela do condomínio, sem travar o campo.
  const escolherVaga = (vagaId: string) => {
    const vaga = disponiveisQuery.data?.find((v) => v.id === vagaId);
    const sugerido = vaga ? precosQuery.data?.find((p) => p.tipo === vaga.tipo) : undefined;
    setForm((f) => ({
      ...f,
      vagaId,
      valorMensal: !f.valorMensal && sugerido ? String(sugerido.valorMensal) : f.valorMensal,
    }));
  };

  const salvar = useMutation({
    mutationFn: (dados: FormState) => {
      const externo = dados.locatarioTipo === 'externo';
      const comum = {
        locatarioTipo: dados.locatarioTipo,
        moradorId: externo ? undefined : dados.moradorId,
        locatarioNome: externo ? dados.locatarioNome.trim() : undefined,
        locatarioDocumento: externo ? dados.locatarioDocumento.trim() || undefined : undefined,
        locatarioTelefoneE164: externo ? dados.locatarioTelefoneE164.trim() || undefined : undefined,
        locatarioEmail: externo ? dados.locatarioEmail.trim() || undefined : undefined,
        valorMensal: Number(dados.valorMensal),
        diaVencimento: Number(dados.diaVencimento),
        dataInicio: dados.dataInicio,
        observacoes: dados.observacoes.trim() || undefined,
      };
      return locacao
        ? api.patch<VagaLocacao>(`/vagas-locacao/${locacao.id}`, comum)
        : api.post<VagaLocacao>('/vagas-locacao', { ...comum, vagaId: dados.vagaId });
    },
    onSuccess: () => {
      toast.success(editando ? 'Locação atualizada.' : 'Locação criada.');
      queryClient.invalidateQueries({ queryKey: ['vagas'] });
      queryClient.invalidateQueries({ queryKey: ['vagas-locacao'] });
      queryClient.invalidateQueries({ queryKey: ['vagas-disponiveis'] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível salvar a locação'));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editando && !form.vagaId) {
      toast.error('Escolha a vaga que será alugada');
      return;
    }
    if (form.locatarioTipo === 'morador' && !form.moradorId) {
      toast.error('Escolha o morador responsável');
      return;
    }
    if (form.locatarioTipo === 'externo') {
      if (!form.locatarioNome.trim()) {
        toast.error('Informe o nome do locatário');
        return;
      }
      if (!form.locatarioTelefoneE164.trim() && !form.locatarioEmail.trim()) {
        toast.error('Informe telefone ou e-mail do locatário — é por onde a cobrança é enviada');
        return;
      }
    }
    if (!form.valorMensal || Number(form.valorMensal) < 0) {
      toast.error('Informe o valor mensal');
      return;
    }
    salvar.mutate(form);
  };

  const semVagasLivres = !editando && disponiveisQuery.isSuccess && disponiveisQuery.data.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar locação' : 'Nova locação'}</DialogTitle>
          <DialogDescription>
            {editando
              ? 'Para trocar de vaga, encerre esta locação e crie outra.'
              : 'Apenas vagas livres aparecem na lista.'}
          </DialogDescription>
        </DialogHeader>

        {semVagasLivres ? (
          <div className="space-y-4">
            <EmptyState
              icon={Car}
              title="Nenhuma vaga livre"
              description="Todas as vagas estão vinculadas a apartamentos ou já alugadas. Cadastre uma vaga nova ou encerre uma locação."
            />
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Entendi
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!editando && (
              <div className="space-y-2">
                <Label htmlFor="loc-vaga">
                  Vaga
                </Label>
                <SimpleSelect
                  id="loc-vaga"
                  value={form.vagaId}
                  onValueChange={escolherVaga}
                  placeholder="Escolha uma vaga livre"
                  options={(disponiveisQuery.data ?? []).map((v) => ({
                    value: v.id,
                    label: `${v.numero} — ${TIPO_VAGA_LABEL[v.tipo]}`,
                    hint: v.localizacao ?? undefined,
                  }))}
                />
              </div>
            )}

            {/* Tipo de locatário */}
            <div className="space-y-2">
              <Label>Quem é o responsável pela vaga?</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    { tipo: 'morador' as const, icone: UserCheck, titulo: 'Morador', desc: 'Já cadastrado' },
                    { tipo: 'externo' as const, icone: UserPlus, titulo: 'Pessoa externa', desc: 'De fora do condomínio' },
                  ]
                ).map(({ tipo, icone: Icone, titulo, desc }) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setForm({ ...form, locatarioTipo: tipo })}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      form.locatarioTipo === tipo
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/40',
                    )}
                  >
                    <Icone
                      className={cn(
                        'h-5 w-5 shrink-0',
                        form.locatarioTipo === tipo ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block txt-corpo font-medium text-foreground">{titulo}</span>
                      <span className="block txt-apoio text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {form.locatarioTipo === 'morador' ? (
              <div className="space-y-2">
                <Label htmlFor="loc-morador">
                  Morador responsável
                </Label>
                <SimpleSelect
                  id="loc-morador"
                  value={form.moradorId}
                  onValueChange={(v) => setForm({ ...form, moradorId: v })}
                  placeholder="Escolha o morador"
                  options={(moradoresQuery.data ?? [])
                    .filter((m) => m.ativo)
                    .map((m) => ({
                      value: m.id,
                      label: m.nome,
                      hint: m.apartamento?.identificador,
                    }))}
                />
              </div>
            ) : (
              <div className="space-y-4 rounded-lg bg-muted/30 p-4">
                <div className="space-y-2">
                  <Label htmlFor="loc-nome">
                    Nome do locatário
                  </Label>
                  <Input
                    id="loc-nome"
                    value={form.locatarioNome}
                    onChange={(e) => setForm({ ...form, locatarioNome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc-doc">
                    CPF
                  </Label>
                  <Input
                    id="loc-doc"
                    value={form.locatarioDocumento}
                    onChange={(e) => setForm({ ...form, locatarioDocumento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc-tel">
                    Telefone (WhatsApp)
                  </Label>
                  <PhoneInput
                    id="loc-tel"
                    value={form.locatarioTelefoneE164}
                    onChange={(e164) => setForm({ ...form, locatarioTelefoneE164: e164 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loc-email">
                    E-mail
                  </Label>
                  <Input
                    id="loc-email"
                    type="email"
                    value={form.locatarioEmail}
                    onChange={(e) => setForm({ ...form, locatarioEmail: e.target.value })}
                  />
                </div>
                <p className="flex items-start gap-2 txt-apoio text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  Telefone ou e-mail é obrigatório — é por onde a cobrança é enviada.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="loc-valor">
                  Valor mensal (R$)
                </Label>
                <Input
                  id="loc-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valorMensal}
                  onChange={(e) => setForm({ ...form, valorMensal: e.target.value })}
                />
                {vagaSelecionada && (
                  <p className="txt-apoio text-muted-foreground">
                    Tabela do condomínio para {TIPO_VAGA_LABEL[vagaSelecionada.tipo].toLowerCase()}:{' '}
                    {fmtMoeda(
                      precosQuery.data?.find((p) => p.tipo === vagaSelecionada.tipo)?.valorMensal ?? null,
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-dia">
                  Dia do vencimento
                </Label>
                <Input
                  id="loc-dia"
                  type="number"
                  min="1"
                  max="31"
                  value={form.diaVencimento}
                  onChange={(e) => setForm({ ...form, diaVencimento: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-inicio">
                Início do contrato
              </Label>
              <Input
                id="loc-inicio"
                type="date"
                value={form.dataInicio}
                onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-obs">
                Observações
              </Label>
              <Textarea
                id="loc-obs"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                rows={2}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={salvar.isPending}
              >
                {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editando ? 'Salvar alterações' : 'Criar locação'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
