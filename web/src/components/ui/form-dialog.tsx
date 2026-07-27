import { FormEvent, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Texto do botão que confirma. Diga a ação, não "OK". */
  submitLabel: string;
  cancelLabel?: string;
  /** Trava o formulário e mostra spinner enquanto a request está no ar. */
  saving?: boolean;
  onSubmit: () => void;
  children: ReactNode;
  className?: string;
  /** Esconde o rodapé quando a tela mostra um estado próprio (ex.: vazio). */
  hideFooter?: boolean;
}

/**
 * Casca padrão dos formulários em diálogo.
 *
 * Centraliza o que toda tela de cadastro precisa acertar e é fácil esquecer:
 * rolagem em tela pequena, botões com alvo de toque de 48px, empilhamento no
 * celular e o estado de "salvando". A tela cuida só dos campos.
 *
 * ```tsx
 * <FormDialog open={open} onOpenChange={setOpen} title="Nova vaga"
 *   submitLabel="Cadastrar vaga" saving={salvar.isPending}
 *   onSubmit={() => salvar.mutate(form)}>
 *   <div className="space-y-2">
 *     <Label htmlFor="numero" className="text-base">Número</Label>
 *     <Input id="numero" value={form.numero} onChange={...} />
 *   </div>
 * </FormDialog>
 * ```
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  cancelLabel = 'Cancelar',
  saving = false,
  onSubmit,
  children,
  className,
  hideFooter = false,
}: FormDialogProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-lg', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {children}

          {!hideFooter && (
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="min-h-[48px] w-full sm:w-auto"
              >
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={saving} className="min-h-[48px] w-full sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
