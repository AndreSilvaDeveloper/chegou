import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, ScanLine, AlertTriangle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CONTAINER_ID = 'scanner-region';

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

export function ScannerModal({
  onResult,
  onEtiqueta,
  onClose,
}: {
  onResult: (text: string) => void;
  /**
   * Quando informado, mostra a opção de fotografar a etiqueta inteira (OCR).
   * O modal só entrega o arquivo — quem faz upload e aplica o resultado é a
   * tela, que é dona do formulário.
   */
  onEtiqueta?: (file: File) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Html5Qrcode | null>(null);
  const fotoRef = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!document.getElementById(CONTAINER_ID)) return;
    let scanner: Html5Qrcode;
    try {
      scanner = new Html5Qrcode(CONTAINER_ID, { formatsToSupport: FORMATS, verbose: false });
    } catch {
      setError('Não foi possível iniciar o leitor.');
      return;
    }
    ref.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
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
          stopSafely(ref.current).finally(() => onResult(text.trim()));
        },
        () => {},
      )
      .catch(() => setError('Não foi possível acessar a câmera. Verifique a permissão do navegador (e use HTTPS).'));

    return () => {
      void stopSafely(ref.current);
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-xs sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-sm space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-panel-lg max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <ScanLine className="h-5 w-5 text-primary" /> Escanear código do pacote
          </h3>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div id={CONTAINER_ID} className="min-h-[200px] w-full overflow-hidden rounded-lg bg-black" />
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 txt-corpo text-red-600 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        ) : (
          <p className="txt-apoio text-muted-foreground">
            Aponte para o QR code ou o código de barras da etiqueta. O código é capturado automaticamente.
          </p>
        )}

        {onEtiqueta && (
          <>
            <div className="flex items-center gap-2 pt-1">
              <span className="h-px flex-1 bg-border" />
              <span className="txt-nota text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                // Cópia antes de zerar: `files` é lista viva e limpar o input a
                // esvazia. Zerar é o que permite refotografar a mesma etiqueta.
                const arquivo = e.target.files?.[0];
                e.target.value = '';
                if (arquivo) onEtiqueta(arquivo);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-[48px] w-full"
              onClick={() => fotoRef.current?.click()}
            >
              <Camera className="mr-2 h-5 w-5" /> Fotografar a etiqueta
            </Button>
            <p className="txt-apoio text-muted-foreground">
              Lê a etiqueta inteira e preenche apartamento, destinatário e transportadora.
              Enquadre a etiqueta toda, sem cortar as bordas.
            </p>
          </>
        )}

        <Button type="button" variant="outline" onClick={onClose} className="w-full">
          Fechar / digitar manualmente
        </Button>
      </div>
    </div>
  );
}
