import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/use-theme';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  
  return (
    <Sonner
      theme={resolvedTheme as 'light' | 'dark'}
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg font-sans min-h-[44px]',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground min-h-[44px]',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground min-h-[44px]',
          closeButton:
            'group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border min-h-[44px] min-w-[44px]',
        },
      }}
      richColors
      closeButton
    />
  );
}
