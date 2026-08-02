import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

/**
 * Avisos passageiros do sistema (salvo, erro, confirmação).
 *
 * DUAS DECISÕES QUE PARECEM DETALHE
 *
 * 1. **Sem `richColors`.** Ele repinta o toast com a paleta do próprio Sonner,
 *    que não é a nossa — era daí que vinha o botão preto no aviso de versão
 *    nova, num tema em que a ação é âmbar. Aqui a superfície e as cores de
 *    estado saem dos tokens do projeto, então o toast é do sistema e não da
 *    biblioteca.
 * 2. **Aviso que fica na tela não é toast.** Toast é passageiro: aparece,
 *    informa e some. Aviso persistente e com ação (a versão nova) tem
 *    componente próprio — `AvisoAtualizacao` — porque brigar com o
 *    posicionamento e com o botão de fechar do Sonner nunca acaba bem: era ele
 *    que punha um X de 44px por cima do título.
 *
 * Os toasts ficam no topo à direita e o `AvisoAtualizacao` no rodapé: os dois
 * nunca disputam o mesmo canto.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as 'light' | 'dark'}
      position="top-right"
      offset={12}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'font-sans gap-3 rounded-surface border border-border-surface bg-popover text-popover-foreground shadow-panel-lg',
          title: 'txt-subtitulo font-semibold',
          description: 'txt-apoio text-muted-foreground',
          // A ação é âmbar (é ação); o resto é neutro.
          actionButton: 'rounded-full bg-primary px-3 txt-corpo font-medium text-primary-foreground',
          cancelButton: 'rounded-full bg-muted px-3 txt-corpo font-medium text-muted-foreground',
          closeButton:
            'rounded-full border-border-surface bg-popover text-muted-foreground hover:text-foreground',
          // Estado com a cor do projeto — o mesmo verde/âmbar/vermelho do resto.
          success: '[&_[data-icon]]:text-emerald-600 dark:[&_[data-icon]]:text-emerald-400',
          warning: '[&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400',
          error: '[&_[data-icon]]:text-destructive',
          info: '[&_[data-icon]]:text-chart-5',
        },
      }}
    />
  );
}
