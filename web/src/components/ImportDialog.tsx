import { useState, useRef } from 'react';
import { api } from '../api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, UploadCloud, FileType, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'apartamentos' | 'moradores';
  onSuccess: () => void;
}

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: { line: number; error: string }[];
}

export function ImportDialog({ open, onOpenChange, type, onSuccess }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const title = type === 'apartamentos' ? 'Importar Apartamentos' : 'Importar Moradores';
  const description = type === 'apartamentos' 
    ? 'Envie um arquivo CSV contendo: bloco (opcional), numero, observacoes, valor_condominio.'
    : 'Envie um arquivo CSV contendo: apartamento_identificador, nome, telefone, documento, email, principal, receber_whatsapp.';

  const handleReset = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Selecione um arquivo CSV');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await api.post<ImportResult>(`/${type}/import`, formData);
      setResult(res);
      
      if (res.successCount > 0) {
        toast.success(`${res.successCount} registros importados com sucesso!`);
        onSuccess();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao importar arquivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!result ? (
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
                
                {file ? (
                  <>
                    <FileType className="h-10 w-10 text-primary mb-2" />
                    <p className="font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="font-medium text-sm">Clique para selecionar um arquivo CSV</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{result.successCount} Sucessos</span>
                </div>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">{result.errorCount} Erros</span>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 bg-destructive/5 text-sm">
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-destructive flex gap-2">
                        <span className="font-mono bg-destructive/10 px-1 rounded">Linha {e.line}</span>
                        <span>{e.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleImport} disabled={!file || loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar
              </Button>
            </>
          ) : (
            <Button type="button" onClick={handleClose}>
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
