import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { VagaLocacao } from '@/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { mensagemErro } from '@/lib/erros';
import { fmtData, nomeLocatario } from './vagas-shared';

const MAX_BYTES = 10 * 1024 * 1024;
const ACEITOS = '.pdf,image/jpeg,image/png,image/webp,image/heic';

export function ContratoDialog({
  open,
  onOpenChange,
  locacao,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locacao: VagaLocacao | null;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) return;
    setArquivo(null);
    setConfirmandoRemocao(false);
  }, [open]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['vagas-locacao'] });
  };

  const enviar = useMutation({
    mutationFn: (file: File) => {
      const dados = new FormData();
      dados.append('file', file);
      return api.upload<VagaLocacao>(`/vagas-locacao/${locacao!.id}/contrato`, dados);
    },
    onSuccess: () => {
      toast.success('Contrato anexado.');
      invalidar();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível enviar o contrato'));
    },
  });

  const remover = useMutation({
    mutationFn: () => api.delete<VagaLocacao>(`/vagas-locacao/${locacao!.id}/contrato`),
    onSuccess: () => {
      toast.success('Contrato removido.');
      invalidar();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(mensagemErro(err, 'Não foi possível remover o contrato'));
    },
  });

  const escolher = (file: File | null) => {
    if (file && file.size > MAX_BYTES) {
      toast.error('Arquivo muito grande. O limite é 10 MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setArquivo(file);
  };

  if (!locacao) return null;
  const temContrato = !!locacao.contratoUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contrato da vaga {locacao.vaga?.numero ?? ''}</DialogTitle>
          <DialogDescription>
            Contrato assinado de {nomeLocatario(locacao)}. Aceita PDF ou foto, até 10 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {temContrato && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">
                    {locacao.contratoNomeArquivo || 'Contrato anexado'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Enviado em {fmtData(locacao.contratoEnviadoAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="min-h-[48px] w-full sm:w-auto">
                  <a href={locacao.contratoUrl!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir contrato
                  </a>
                </Button>
                {!confirmandoRemocao && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmandoRemocao(true)}
                    className="min-h-[48px] w-full text-red-600 hover:text-red-600 dark:text-red-400 sm:w-auto"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remover contrato
                  </Button>
                )}
              </div>

              {confirmandoRemocao && (
                <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-sm text-foreground">
                    Remover o contrato desta locação? O arquivo é apagado e não dá para desfazer.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmandoRemocao(false)}
                      disabled={remover.isPending}
                      className="min-h-[48px] w-full sm:w-auto"
                    >
                      Manter contrato
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => remover.mutate()}
                      disabled={remover.isPending}
                      className="min-h-[48px] w-full sm:w-auto"
                    >
                      {remover.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sim, remover
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="contrato-file" className="text-base">
              {temContrato ? 'Substituir por outro arquivo' : 'Arquivo do contrato'}
            </Label>
            <input
              ref={inputRef}
              id="contrato-file"
              type="file"
              accept={ACEITOS}
              onChange={(e) => escolher(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border border-input bg-background p-3 text-base file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
            />
            {arquivo && (
              <p className="text-sm text-muted-foreground">
                {arquivo.name} — {(arquivo.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="min-h-[48px] w-full sm:w-auto"
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={() => arquivo && enviar.mutate(arquivo)}
            disabled={!arquivo || enviar.isPending}
            className="min-h-[48px] w-full sm:w-auto"
          >
            {enviar.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {temContrato ? 'Substituir contrato' : 'Anexar contrato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
