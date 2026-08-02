import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownToLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Nova versão disponível" — o único aviso do app que fica na tela esperando.
 *
 * POR QUE NÃO É UM TOAST
 *
 * Era, com `duration: Infinity`. Toast é passageiro por definição, e forçar um
 * a ficar cobrava o preço em cima: o botão de fechar do Sonner é posicionado no
 * canto por conta dele e caía por cima do título, e a ação vinha com a cor da
 * biblioteca em vez do âmbar do sistema. Aqui a superfície é a do projeto
 * (`popover`, `rounded-surface`, `shadow-panel-lg`) e a anatomia é a do card de
 * lista: bloco de ícone chapado, título, apoio, ação.
 *
 * ONDE ELE FICA
 *
 * No **rodapé**, e não no topo: no celular o topo é a faixa âmbar com busca e
 * menu — era ali que o aviso antigo aparecia, por cima de tudo. Os toasts
 * passageiros continuam no topo à direita, então os dois nunca se empilham.
 * No desktop ele vira um cartão de largura fixa no canto; no celular ocupa a
 * linha, respeitando a área segura do aparelho.
 */
export function AvisoAtualizacao({
  aberto,
  aplicar,
  dispensar,
}: {
  aberto: boolean;
  aplicar: () => void;
  dispensar: () => void;
}) {
  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[22rem]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-start gap-3 rounded-surface border border-border-surface bg-popover p-4 text-popover-foreground shadow-panel-lg">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            >
              <ArrowDownToLine className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="txt-subtitulo font-semibold">Nova versão disponível</p>
              {/* Diz o que VAI acontecer. O aviso não é uma pergunta: a
                  atualização entra sozinha de qualquer forma, no momento em que
                  não houver nada digitado para perder. */}
              <p className="mt-0.5 txt-apoio text-muted-foreground">
                Ela entra sozinha quando você terminar o que está fazendo. Nada do que você
                digitou se perde.
              </p>
              <Button size="sm" className="mt-3" onClick={aplicar}>
                Atualizar agora
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dispensar aviso"
              onClick={dispensar}
              className="-mr-1 -mt-1 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
