import { useRef } from 'react';
import { TemplateVariavel } from '@/api/types';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  variaveis: TemplateVariavel[];
  templatePadrao: string;
  disabled?: boolean;
  /** Precisa ser único na tela — há mais de um editor por página. */
  id?: string;
  titulo?: string;
  /** Uma linha explicando quando essa mensagem sai. */
  ajuda?: string;
}

/** Renderização de preview no cliente (espelha o renderer do backend, com exemplos). */
function renderPreview(template: string, variaveis: TemplateVariavel[]): string {
  const base = template.trim() || '';
  const exemplos: Record<string, string> = {};
  for (const v of variaveis) exemplos[v.token.toLowerCase()] = v.exemplo;
  return base.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, raw: string) => exemplos[raw.toLowerCase()] ?? '');
}

export function TemplateEditor({
  value,
  onChange,
  variaveis,
  templatePadrao,
  disabled,
  id = 'template',
  titulo = 'Mensagem enviada ao morador',
  ajuda,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const inserirToken = (token: string) => {
    const el = ref.current;
    const snippet = `{{${token}}}`;
    if (!el) {
      onChange(`${value}${snippet}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // reposiciona o cursor após o token inserido
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const efetivo = value.trim() ? value : templatePadrao;
  const preview = renderPreview(efetivo, variaveis);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id}>{titulo}</Label>
        {ajuda && <p className="txt-apoio text-muted-foreground">{ajuda}</p>}
        <Textarea
          id={id}
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={9}
          placeholder="Deixe em branco para usar o modelo padrão do sistema."
          className="font-mono txt-corpo leading-relaxed"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="txt-apoio text-muted-foreground">
            Toque numa variável para inseri-la no texto. Apagar tudo volta ao modelo padrão.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(templatePadrao)}
            className="h-8 txt-nota"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restaurar padrão
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="txt-apoio text-muted-foreground">Variáveis disponíveis</Label>
        <div className="flex flex-wrap gap-2">
          {variaveis.map((v) => (
            <button
              key={v.token}
              type="button"
              disabled={disabled}
              onClick={() => inserirToken(v.token)}
              title={`${v.descricao} (ex.: ${v.exemplo})`}
              className={cn(
                'rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono txt-nota text-foreground transition-colors',
                'hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50',
              )}
            >
              {`{{${v.token}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 txt-apoio text-muted-foreground">
          <MessageSquare className="h-4 w-4" /> Prévia
        </Label>
        <div className="whitespace-pre-wrap rounded-xl border border-border bg-emerald-500/5 p-4 txt-corpo leading-relaxed text-foreground">
          {preview || <span className="text-muted-foreground">Sua mensagem aparecerá aqui…</span>}
        </div>
      </div>
    </div>
  );
}
