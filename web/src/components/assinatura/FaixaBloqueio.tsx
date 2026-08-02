import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { fmtMoeda } from '@/lib/formato';

/** O que o 402 do backend carrega em `assinatura`. */
export interface BloqueioAssinatura {
  bloqueado: true;
  motivo?: string;
  valorEmAberto?: number;
  faturasVencidas?: number;
  diasEmAtraso?: number;
  linkPagamento?: string | null;
  telaAssinatura?: string;
}

/** Evento interno: o client da API avisa a tela quando toma um 402. */
const EVENTO = 'chegou:assinatura-bloqueada';

/** Chamado pelo `api` ao receber 402. Ver `api/client.ts`. */
export function anunciarBloqueio(bloqueio: BloqueioAssinatura): void {
  window.dispatchEvent(new CustomEvent<BloqueioAssinatura>(EVENTO, { detail: bloqueio }));
}

/**
 * A faixa que aparece quando a assinatura está em atraso.
 *
 * **O 402 do backend vira esta faixa, não um toast genérico.** A diferença não é
 * estética: um toast some em quatro segundos e leva junto a informação de como
 * resolver. Aqui a faixa fica, diz quanto se deve e oferece o caminho — abrir o
 * link de pagamento ou ir para a tela da assinatura.
 *
 * Ela nasce de um evento, e não de uma query própria, porque o bloqueio se
 * descobre **tentando**: o cliente clica em "Registrar encomenda", o backend
 * responde 402, e é esse 402 que traz o motivo e o valor já calculados. Uma
 * query separada perguntaria a mesma coisa ao gateway de novo.
 */
export function FaixaBloqueio() {
  const [bloqueio, setBloqueio] = useState<BloqueioAssinatura | null>(null);

  useEffect(() => {
    const aoBloquear = (e: Event) => setBloqueio((e as CustomEvent<BloqueioAssinatura>).detail);
    window.addEventListener(EVENTO, aoBloquear);
    return () => window.removeEventListener(EVENTO, aoBloquear);
  }, []);

  return (
    <AnimatePresence>
      {bloqueio && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          role="alert"
          className="fixed inset-x-0 top-0 z-50 border-b border-destructive/30 bg-destructive px-4 py-3 text-destructive-foreground"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="txt-subtitulo font-semibold">
                  {bloqueio.motivo ?? 'Assinatura do Chegou em atraso'}
                </p>
                <p className="txt-apoio opacity-90">
                  {bloqueio.valorEmAberto !== undefined
                    ? `${fmtMoeda(bloqueio.valorEmAberto)} em aberto`
                    : 'Há faturas em aberto'}
                  {bloqueio.diasEmAtraso ? ` · ${bloqueio.diasEmAtraso} dia(s) de atraso` : ''}
                  {' · '}
                  {/* O porquê, em uma frase: sem isto a faixa parece um erro do
                      sistema, e o porteiro fica tentando de novo. */}
                  o registro de encomendas fica pausado até a regularização.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              {bloqueio.linkPagamento && (
                <Button asChild size="sm" variant="secondary" className="rounded-full">
                  <a href={bloqueio.linkPagamento} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Pagar agora
                  </a>
                </Button>
              )}
              <Button asChild size="sm" variant="secondary" className="rounded-full">
                <Link to={bloqueio.telaAssinatura ?? '/assinatura'} onClick={() => setBloqueio(null)}>
                  Ver a conta
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
