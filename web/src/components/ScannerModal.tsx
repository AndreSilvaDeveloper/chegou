import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const CONTAINER_ID = 'scanner-region';

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
];

export function ScannerModal({
  onResult,
  onClose,
}: {
  onResult: (text: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Html5Qrcode | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!document.getElementById(CONTAINER_ID)) return;
    const scanner = new Html5Qrcode(CONTAINER_ID, { formatsToSupport: FORMATS, verbose: false });
    ref.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 170 } },
        (text) => {
          if (done.current) return;
          done.current = true;
          scanner.stop().catch(() => {}).finally(() => onResult(text.trim()));
        },
        () => {},
      )
      .catch(() => setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.'));

    return () => {
      const s = ref.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-4 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Escanear código do pacote</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div id={CONTAINER_ID} className="rounded-lg overflow-hidden bg-black min-h-[220px]" />
        {error ? (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>
        ) : (
          <p className="text-xs text-slate-500">Aponte para o QR code ou o código de barras da etiqueta. O código é capturado automaticamente.</p>
        )}
      </div>
    </div>
  );
}
