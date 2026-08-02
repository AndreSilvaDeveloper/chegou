import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { APP_VERSION, CHAVE_VERSAO } from '@/lib/versao';

/**
 * De quanto em quanto tempo perguntar ao servidor se subiu versão nova.
 * O navegador só procura sozinho quando a página carrega — sem isto, um app
 * aberto o dia inteiro na portaria nunca ficaria sabendo de um deploy.
 */
const INTERVALO_CHECAGEM_MS = 60_000;

/** Com que frequência reavaliar se já dá para aplicar a versão que está pronta. */
const INTERVALO_APLICACAO_MS = 10_000;

/** Tempo sem toque/tecla para considerar que ninguém está no meio de algo. */
const OCIOSO_MS = 30_000;

/**
 * Recarregar no meio de um cadastro apagaria o que o porteiro digitou. Estes
 * três sinais cobrem isso sem precisar de marcação em cada tela: diálogo
 * aberto, campo com foco, ou qualquer campo já preenchido.
 */
function momentoSeguro(): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;

  const foco = document.activeElement;
  if (foco instanceof HTMLElement) {
    if (foco.isContentEditable) return false;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(foco.tagName)) return false;
  }

  const campos = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  for (const campo of campos) {
    if (campo.disabled || campo.readOnly) continue;
    if (campo instanceof HTMLInputElement && (campo.type === 'hidden' || campo.type === 'file')) continue;
    if (campo.value.trim() !== '') return false;
  }
  return true;
}

/**
 * Mantém o app sempre na última versão publicada, sem ninguém dar reload.
 *
 * Como funciona: o service worker do PWA é consultado de tempos em tempos; se
 * houver build novo, ele é baixado e fica pronto. Aplicar significa recarregar
 * a página — e isso só acontece em momento natural:
 *
 * 1. quando o usuário troca de tela (o que ele estava vendo já foi descartado);
 * 2. quando o app está ocioso e sem nada digitado.
 *
 * Enquanto espera, o `AvisoAtualizacao` oferece "Atualizar agora" para quem não
 * quiser esperar. Vale para o navegador e para o PWA instalado — os dois usam o
 * mesmo service worker. Em dev não há service worker, então o hook fica inerte.
 *
 * **O hook não desenha nada**: devolve o estado e as duas ações. O aviso era um
 * toast de duração infinita, e toast é passageiro por definição — quem paga
 * essa conta é o layout (o X do Sonner caía por cima do título) e o tema (o
 * botão de ação vinha com a cor da biblioteca, não a nossa).
 */
export function useAtualizacaoAutomatica(): {
  /** Há build novo pronto e o usuário ainda não dispensou o aviso. */
  temVersaoNova: boolean;
  /** Recarrega agora, ativando o service worker novo. */
  aplicar: () => void;
  /** Esconde o aviso. A atualização continua valendo e entra sozinha depois. */
  dispensar: () => void;
} {
  const { pathname } = useLocation();
  const ultimaInteracao = useRef(Date.now());
  const rotaNaDeteccao = useRef<string | null>(null);
  const aplicando = useRef(false);
  const [dispensado, setDispensado] = useState(false);

  const {
    needRefresh: [temVersaoNova],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;

      const procurarVersaoNova = async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          // Bate no sw.js ignorando cache: se o servidor respondeu, vale a pena
          // pedir ao navegador que compare com o que ele tem instalado.
          const resposta = await fetch(swUrl, {
            cache: 'no-store',
            headers: { 'cache-control': 'no-cache' },
          });
          if (resposta.status === 200) await registration.update();
        } catch {
          // Rede instável na portaria é rotina — tenta de novo no próximo ciclo.
        }
      };

      window.setInterval(procurarVersaoNova, INTERVALO_CHECAGEM_MS);
      // Voltar ao app depois de um tempo é quando mais vale checar: é aí que o
      // porteiro reabre o PWA e um deploy pode ter acontecido no meio.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void procurarVersaoNova();
      });
      window.addEventListener('online', () => void procurarVersaoNova());
    },
  });

  // Avisa, uma única vez, que a atualização já aconteceu.
  useEffect(() => {
    const anterior = localStorage.getItem(CHAVE_VERSAO);
    localStorage.setItem(CHAVE_VERSAO, APP_VERSION);
    if (anterior && anterior !== APP_VERSION) {
      toast.success(`Atualizado para a versão ${APP_VERSION}`, { duration: 5000 });
    }
  }, []);

  // Registra sinal de vida do usuário, para saber quando o app está parado.
  useEffect(() => {
    const marcar = () => {
      ultimaInteracao.current = Date.now();
    };
    window.addEventListener('pointerdown', marcar, { passive: true });
    window.addEventListener('keydown', marcar, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', marcar);
      window.removeEventListener('keydown', marcar);
    };
  }, []);

  const aplicar = useCallback(() => {
    if (aplicando.current) return;
    aplicando.current = true;
    // `true` = ativa o service worker novo e recarrega a página sozinho.
    void updateServiceWorker?.(true);
  }, [updateServiceWorker]);

  useEffect(() => {
    if (!temVersaoNova) {
      rotaNaDeteccao.current = null;
      return;
    }

    // Primeira vez que vemos a versão nova: guarda a rota em que ela apareceu.
    if (rotaNaDeteccao.current === null) {
      rotaNaDeteccao.current = pathname;
    } else if (rotaNaDeteccao.current !== pathname) {
      // Trocou de tela: a anterior já foi embora, recarregar não custa nada.
      aplicar();
      return;
    }

    const timer = window.setInterval(() => {
      if (Date.now() - ultimaInteracao.current < OCIOSO_MS) return;
      if (!momentoSeguro()) return;
      aplicar();
    }, INTERVALO_APLICACAO_MS);

    return () => window.clearInterval(timer);
  }, [temVersaoNova, pathname, aplicar]);

  return {
    temVersaoNova: temVersaoNova && !dispensado,
    aplicar,
    // Dispensar esconde o aviso, não cancela a atualização: ela continua
    // entrando sozinha no próximo momento seguro. É por isso que o texto do
    // aviso diz o que vai acontecer, em vez de sugerir uma escolha que não há.
    dispensar: () => setDispensado(true),
  };
}
