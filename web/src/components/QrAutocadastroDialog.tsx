import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { mensagemErro } from '@/lib/erros';

/**
 * Diálogo do link/QR de autocadastro de morador (síndico e administradora).
 *
 * O token vem do servidor (`/moradores/autocadastro-link`, escopo do condomínio
 * em uso); a URL é montada com a origem atual. "Gerar novo link" rotaciona o
 * token e invalida o QR impresso anterior — por isso passa por confirmação.
 */
export function QrAutocadastroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [confirmarRotacao, setConfirmarRotacao] = useState(false);
  const [rotacionando, setRotacionando] = useState(false);

  const aplicarToken = async (token: string) => {
    const link = `${window.location.origin}/cadastro/${token}`;
    setUrl(link);
    setQr(await QRCode.toDataURL(link, { width: 320, margin: 1 }));
  };

  useEffect(() => {
    if (!open) return;
    let ativo = true;
    setCarregando(true);
    api
      .get<{ token: string }>('/moradores/autocadastro-link')
      .then(async ({ token }) => {
        if (ativo) await aplicarToken(token);
      })
      .catch((err) => ativo && toast.error(mensagemErro(err, 'Não foi possível gerar o link')))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [open]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Copie o link manualmente.');
    }
  };

  const baixar = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = 'qr-cadastro-morador.png';
    a.click();
  };

  const rotacionar = async () => {
    setRotacionando(true);
    try {
      const { token } = await api.post<{ token: string }>('/moradores/autocadastro-link/rotate');
      await aplicarToken(token);
      toast.success('Novo link gerado. O QR anterior deixou de funcionar.');
      setConfirmarRotacao(false);
    } catch (err) {
      toast.error(mensagemErro(err, 'Não foi possível gerar um novo link'));
    } finally {
      setRotacionando(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link de autocadastro</DialogTitle>
            <DialogDescription>
              O morador lê o QR (ou abre o link) e se cadastra sozinho, escolhendo a própria unidade.
              Passa a receber os avisos de encomenda no WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {carregando ? (
                <Skeleton className="h-[240px] w-[240px] rounded-lg" />
              ) : (
                <div className="rounded-lg bg-white p-3">
                  {/* QR precisa de fundo claro para leitura — fixo, independe do tema. */}
                  <img src={qr} alt="QR Code de autocadastro" className="h-[240px] w-[240px]" />
                </div>
              )}
            </div>

            {!carregando && (
              <div className="rounded-md border border-border bg-muted px-3 py-2">
                <p className="break-all txt-apoio text-muted-foreground">{url}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={copiar} disabled={carregando}>
                {copiado ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Copiar link
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={baixar} disabled={carregando}>
                <Download className="mr-2 h-4 w-4" /> Baixar QR
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setConfirmarRotacao(true)}
              disabled={carregando}
            >
              {rotacionando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Gerar novo link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmarRotacao}
        onOpenChange={setConfirmarRotacao}
        title="Gerar um novo link?"
        description="O link e o QR atuais deixarão de funcionar. Quem já tiver o QR antigo (impresso ou salvo) não conseguirá se cadastrar. Use isto se o link tiver vazado."
        confirmLabel="Gerar novo link"
        variant="destructive"
        loading={rotacionando}
        onConfirm={rotacionar}
      />
    </>
  );
}
