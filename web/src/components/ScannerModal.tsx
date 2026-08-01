import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ScanLine, AlertTriangle, Camera, Loader2, ImageUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useIsMobile } from '@/hooks/use-mobile';
import { capturarQuadro, pareceTremida, prepararFoto, type FotoPreparada } from '@/lib/imagem';
import { cn } from '@/lib/utils';

const CONTAINER_ID = 'scanner-region';
/** Webcam escolhida no desktop. Sem isto o notebook reabre a integrada a cada encomenda. */
const CAMERA_KEY = 'portaria.cameraEtiqueta';

/**
 * Abaixo disto a foto não tem pixel para o OCR resolver `APTO 302` em fonte
 * pequena. É o risco central da captura via navegador: sem constraint explícita
 * o `getUserMedia` entrega 640x480, que é PIOR que a câmera nativa do celular.
 */
const LARGURA_MINIMA_UTIL = 1280;

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
];

/** Para o scanner sem deixar exceção escapar (stop() lança se já estiver parado). */
function stopSafely(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return Promise.resolve();
  let p: Promise<void>;
  try {
    p = scanner.stop();
  } catch {
    return Promise.resolve();
  }
  return p
    .catch(() => {})
    .then(() => {
      try {
        scanner.clear();
      } catch {
        /* já limpo */
      }
    });
}

/**
 * Traduz o erro da câmera para algo que o porteiro consiga agir.
 *
 * Antes tudo caía em "verifique a permissão do navegador" — inclusive no
 * desktop sem webcam, onde não existe permissão nenhuma para verificar.
 */
function mensagemDeErroDeCamera(err: unknown): string {
  const nome = (err as { name?: string } | null)?.name ?? '';
  if (!window.isSecureContext || !navigator.mediaDevices) {
    return 'A câmera só funciona em conexão segura (HTTPS). Use o botão de escolher arquivo.';
  }
  switch (nome) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão de câmera negada. Libere o acesso nas configurações do navegador e tente de novo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhuma câmera encontrada neste computador. Use o botão de escolher arquivo.';
    case 'NotReadableError':
      return 'A câmera está sendo usada por outro programa (Teams, Meet, Zoom). Feche-o e tente de novo.';
    default:
      return 'Não foi possível acessar a câmera. Use o botão de escolher arquivo.';
  }
}

type Modo = 'foto' | 'codigo';

export function ScannerModal({
  onResult,
  onEtiqueta,
  onClose,
}: {
  onResult: (text: string) => void;
  /**
   * Quando informado, a leitura da etiqueta por foto é a ação PRINCIPAL — ela
   * preenche apartamento, destinatário e transportadora de uma vez, enquanto o
   * código de barras preenche só o rastreio. Sem ela (administradora, que não
   * tem a rota de OCR), o modal abre direto no leitor de código.
   *
   * O modal só entrega o arquivo já preparado para o OCR; quem faz upload e
   * aplica o resultado é a tela, que é dona do formulário.
   */
  onEtiqueta?: (file: File) => void;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [modo, setModo] = useState<Modo>(onEtiqueta ? 'foto' : 'codigo');
  const [error, setError] = useState<string | null>(null);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [camerasDisponiveis, setCamerasDisponiveis] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>(() => localStorage.getItem(CAMERA_KEY) ?? '');
  const [larguraStream, setLarguraStream] = useState<number | null>(null);
  /** Só aparece quando a foto sai tremida — foto boa segue direto, sem toque extra. */
  const [revisao, setRevisao] = useState<{ foto: FotoPreparada; url: string } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);

  // No celular a câmera nativa do sistema é usada direto (autofoco e resolução
  // muito melhores que a stream do navegador); o visor in-app é do desktop.
  const usaWebcam = modo === 'foto' && !!onEtiqueta && !isMobile;

  const fechar = useCallback(() => {
    onClose();
  }, [onClose]);

  // ---- Leitor de código de barras / QR (modo secundário) ----
  useEffect(() => {
    if (modo !== 'codigo') return;
    if (!document.getElementById(CONTAINER_ID)) {
      setError('Não foi possível iniciar o leitor.');
      return;
    }
    let scanner: Html5Qrcode;
    try {
      scanner = new Html5Qrcode(CONTAINER_ID, { formatsToSupport: FORMATS, verbose: false });
    } catch {
      setError('Não foi possível iniciar o leitor.');
      return;
    }
    scannerRef.current = scanner;

    scanner
      .start(
        cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' },
        {
          fps: 10,
          aspectRatio: 1.3333,
          qrbox: (vw: number, vh: number) => {
            const w = Math.max(120, Math.min(vw - 24, 300));
            const h = Math.max(80, Math.min(vh - 24, 200));
            return { width: w, height: h };
          },
        },
        (text) => {
          if (done.current) return;
          done.current = true;
          stopSafely(scannerRef.current).finally(() => onResult(text.trim()));
        },
        () => {},
      )
      .catch((err) => setError(mensagemDeErroDeCamera(err)));

    return () => {
      void stopSafely(scannerRef.current);
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, cameraId]);

  // ---- Webcam do desktop (modo principal) ----
  useEffect(() => {
    if (!usaWebcam) return;
    let cancelado = false;

    const pararStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErroCamera(mensagemDeErroDeCamera(null));
        return;
      }
      try {
        // A resolução vai como `ideal`, nunca `exact`: exigir o que a webcam não
        // tem derruba a stream inteira com OverconstrainedError. `torch` e
        // `focusMode` ficam fora daqui pelo mesmo motivo — vão depois, no track.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' }),
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setErroCamera(null);

        const track = stream.getVideoTracks()[0];
        try {
          // `focusMode` é capability real do Chrome/Android, mas não está no
          // `MediaTrackConstraintSet` do TS — daí o `unknown` no meio. Navegador
          // que não suporta ignora, por isso vai isolado num try.
          await track?.applyConstraints({
            advanced: [{ focusMode: 'continuous' }],
          } as unknown as MediaTrackConstraints);
        } catch {
          /* webcam sem controle de foco */
        }
        setLarguraStream(track?.getSettings().width ?? null);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // O `label` do dispositivo só existe depois da permissão concedida —
        // por isso a enumeração vem aqui, e não na montagem.
        const todos = await navigator.mediaDevices.enumerateDevices();
        if (!cancelado) setCamerasDisponiveis(todos.filter((d) => d.kind === 'videoinput'));
      } catch (err) {
        if (!cancelado) setErroCamera(mensagemDeErroDeCamera(err));
      }
    })();

    return () => {
      cancelado = true;
      pararStream();
    };
  }, [usaWebcam, cameraId]);

  useEffect(() => {
    return () => {
      if (revisao) URL.revokeObjectURL(revisao.url);
    };
  }, [revisao]);

  /** Foto pronta: segue direto se estiver nítida, pede confirmação se tremeu. */
  const aplicarFoto = (foto: FotoPreparada) => {
    if (!onEtiqueta) return;
    if (pareceTremida(foto)) {
      setRevisao({ foto, url: URL.createObjectURL(foto.arquivo) });
      return;
    }
    onEtiqueta(foto.arquivo);
  };

  const tirarFotoWebcam = async () => {
    if (preparando || !videoRef.current) return;
    setPreparando(true);
    try {
      const foto = await capturarQuadro(videoRef.current);
      if (!foto) {
        setErroCamera('Não foi possível capturar a imagem. Tente de novo.');
        return;
      }
      aplicarFoto(foto);
    } finally {
      setPreparando(false);
    }
  };

  const usarArquivo = async (arquivo: File) => {
    if (preparando) return;
    setPreparando(true);
    try {
      aplicarFoto(await prepararFoto(arquivo));
    } finally {
      setPreparando(false);
    }
  };

  const descartarRevisao = () => {
    if (revisao) URL.revokeObjectURL(revisao.url);
    setRevisao(null);
  };

  const streamFraca = larguraStream !== null && larguraStream < LARGURA_MINIMA_UTIL;
  const ehFoto = modo === 'foto';

  return (
    // O `Dialog` do projeto, e não um overlay próprio: mesma superfície, mesmo
    // raio, mesma rolagem em `dvh` e o mesmo X no cabeçalho de todo diálogo.
    // Trocar de modo NÃO remonta o diálogo — o nó do vídeo só some quando o
    // próprio modo deixa de mostrá-lo, que é o comportamento desejado.
    <Dialog open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ehFoto ? (
              <Camera className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ScanLine className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            {ehFoto ? 'Fotografar a etiqueta' : 'Ler código de barras'}
          </DialogTitle>
          <DialogDescription>
            {ehFoto
              ? 'Enquadre a etiqueta inteira, sem cortar as bordas. Preenche apartamento, destinatário e transportadora de uma vez.'
              : 'Aponte para o QR code ou o código de barras. Ele é capturado sozinho e preenche só o rastreio.'}
          </DialogDescription>
        </DialogHeader>

        {/* ---- Revisão: só aparece quando a foto saiu tremida ---- */}
        {revisao ? (
          <div className="space-y-3">
            <img
              src={revisao.url}
              alt="Foto capturada da etiqueta"
              className="w-full rounded-lg bg-muted object-contain"
            />
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 txt-corpo text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                A foto parece tremida. Uma foto nítida acerta muito mais campos — vale tirar outra.
              </span>
            </div>
            <Button type="button" size="lg" className="w-full" onClick={descartarRevisao}>
              <RefreshCw className="mr-2 h-5 w-5" /> Tirar outra foto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                const arquivo = revisao.foto.arquivo;
                descartarRevisao();
                onEtiqueta?.(arquivo);
              }}
            >
              Usar esta mesmo assim
            </Button>
          </div>
        ) : (
          <>
            {/* ---- MODO FOTO (principal) ---- */}
            {modo === 'foto' && onEtiqueta && (
              <div className="space-y-3">
                {usaWebcam && !erroCamera && (
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="h-auto max-h-[45dvh] w-full object-contain"
                    />
                    {/* Guia de enquadramento folgado: a etiqueta inteira precisa
                        caber, então ele orienta sem virar um recorte apertado. */}
                    <div className="pointer-events-none absolute inset-4 rounded-md border-2 border-dashed border-white/60" />
                  </div>
                )}

                {erroCamera && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 txt-corpo text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erroCamera}
                  </div>
                )}

                {streamFraca && !erroCamera && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 txt-apoio text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Esta câmera entrega imagem de baixa resolução ({larguraStream}px). A leitura
                      pode falhar — se possível, escolha outra câmera ou envie uma foto do celular.
                    </span>
                  </div>
                )}

                {usaWebcam && camerasDisponiveis.length > 1 && (
                  <div className="space-y-1.5">
                    <span className="txt-apoio text-muted-foreground">Câmera</span>
                    <SimpleSelect
                      value={cameraId}
                      onValueChange={(v) => {
                        setCameraId(v);
                        setLarguraStream(null);
                        if (v) localStorage.setItem(CAMERA_KEY, v);
                        else localStorage.removeItem(CAMERA_KEY);
                      }}
                      options={[
                        { value: '', label: 'Câmera padrão' },
                        ...camerasDisponiveis.map((d, i) => ({
                          value: d.deviceId,
                          label: d.label || `Câmera ${i + 1}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                <input
                  ref={arquivoRef}
                  type="file"
                  accept="image/*"
                  // `capture` abre a câmera nativa no celular e é ignorado no
                  // desktop (onde vira seletor de arquivo, que é o fallback certo).
                  {...(isMobile ? { capture: 'environment' as const } : {})}
                  className="hidden"
                  onChange={(e) => {
                    // Cópia antes de zerar: `files` é lista viva e limpar o input a
                    // esvazia. Zerar é o que permite refotografar a mesma etiqueta.
                    const arquivo = e.target.files?.[0];
                    e.target.value = '';
                    if (arquivo) void usarArquivo(arquivo);
                  }}
                />

                {usaWebcam && !erroCamera ? (
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={preparando}
                    onClick={tirarFotoWebcam}
                  >
                    {preparando ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Camera className="mr-2 h-5 w-5" />
                    )}
                    Tirar foto da etiqueta
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={preparando}
                    onClick={() => arquivoRef.current?.click()}
                  >
                    {preparando ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Camera className="mr-2 h-5 w-5" />
                    )}
                    {isMobile ? 'Fotografar a etiqueta' : 'Escolher uma foto'}
                  </Button>
                )}

                {/* A instrução de enquadramento vive no `DialogDescription`. */}

                {usaWebcam && !erroCamera && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    disabled={preparando}
                    onClick={() => arquivoRef.current?.click()}
                  >
                    <ImageUp className="mr-2 h-5 w-5" /> Escolher uma foto do computador
                  </Button>
                )}
              </div>
            )}

            {/* ---- MODO CÓDIGO (secundário) ---- */}
            {modo === 'codigo' && (
              <div className="space-y-3">
                <div
                  id={CONTAINER_ID}
                  className="min-h-[200px] w-full overflow-hidden rounded-lg bg-black sm:min-h-[280px]"
                />
                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 txt-corpo text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                  </div>
                )}
              </div>
            )}

            {/* ---- Troca entre os dois caminhos ---- */}
            {onEtiqueta && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <span className="h-px flex-1 bg-border" />
                  <span className="txt-nota text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setError(null);
                    setErroCamera(null);
                    setModo(modo === 'foto' ? 'codigo' : 'foto');
                  }}
                >
                  {modo === 'foto' ? (
                    <>
                      <ScanLine className="mr-2 h-5 w-5" /> Ler QR / código de barras
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-5 w-5" /> Fotografar a etiqueta
                    </>
                  )}
                </Button>
              </>
            )}

            <Button
              type="button"
              variant="ghost"
              onClick={fechar}
              className={cn('w-full', !onEtiqueta && 'mt-1')}
            >
              Fechar e digitar manualmente
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
