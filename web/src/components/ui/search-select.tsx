import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Linha de apoio, só para leitura — não entra no filtro. */
  hint?: string;
  /**
   * Texto extra que também casa na busca (ex.: o bloco da unidade).
   *
   * O `hint` de propósito NÃO é usado aqui: uma dica como "Bloco A" faria toda
   * opção casar com o prefixo "b".
   */
  busca?: string;
}

interface SearchSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  /** Texto do campo de busca — diga o que dá para digitar. */
  searchPlaceholder?: string;
  /** Chamado ao digitar, para quem busca no servidor. */
  onSearchChange?: (termo: string) => void;
  /** Há busca em andamento no servidor — evita mostrar lista defasada. */
  carregando?: boolean;
  /** Aviso quando a lista veio cortada pelo servidor. */
  rodape?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Select com busca por digitação.
 *
 * Existe porque lista grande em `<select>` é impraticável no celular: o síndico
 * de um condomínio de 200 unidades precisa digitar "A" e ver o bloco A, ou "1" e
 * ver as unidades que começam em 1. O filtro local casa por **prefixo** (mesma
 * regra da busca do servidor), com um respiro: se nada casar por prefixo, cai
 * para "contém", para o usuário não ficar olhando lista vazia.
 */
export function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Selecione',
  searchPlaceholder = 'Digite para filtrar...',
  onSearchChange,
  carregando = false,
  rodape,
  id,
  disabled,
  className,
}: SearchSelectProps) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const selecionada = options.find((o) => o.value === value);

  useEffect(() => {
    if (!aberto) return;
    // Foca a busca ao abrir — quem abriu quer digitar.
    const t = setTimeout(() => buscaRef.current?.focus(), 30);
    const aoClicarFora = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', aoClicarFora);
    };
  }, [aberto]);

  const filtradas = useMemo(() => {
    // Busca no servidor: as opções JÁ vêm filtradas. Filtrar de novo aqui só
    // criaria divergência — o servidor casa também pelo número da unidade, que
    // não está no rótulo ("A-101" não começa com "1", mas o apartamento sim).
    if (onSearchChange) return options;

    const t = termo.trim().toLowerCase();
    if (!t) return options;
    const porPrefixo = options.filter(
      (o) => o.label.toLowerCase().startsWith(t) || o.busca?.toLowerCase().startsWith(t),
    );
    return porPrefixo.length > 0
      ? porPrefixo
      : options.filter((o) => o.label.toLowerCase().includes(t));
  }, [options, termo, onSearchChange]);

  const escolher = (v: string) => {
    onValueChange(v);
    setAberto(false);
    setTermo('');
    onSearchChange?.('');
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setAberto((a) => !a)}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 txt-corpo ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate text-left', !selecionada && 'text-muted-foreground')}>
          {selecionada ? selecionada.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={buscaRef}
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAberto(false);
                if (e.key === 'Enter' && filtradas.length > 0) {
                  e.preventDefault();
                  escolher(filtradas[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              className="h-11 pl-9"
            />
          </div>

          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {carregando ? (
              <li className="px-3 py-6 text-center txt-apoio text-muted-foreground">Buscando…</li>
            ) : filtradas.length === 0 ? (
              <li className="px-3 py-6 text-center txt-apoio text-muted-foreground">
                Nada encontrado para "{termo}"
              </li>
            ) : (
              filtradas.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onClick={() => escolher(o.value)}
                    className={cn(
                      'flex min-h-[48px] w-full items-center justify-between gap-2 px-3 py-2 text-left txt-corpo hover:bg-accent',
                      o.value === value && 'bg-accent/60',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && (
                        <span className="block truncate txt-apoio text-muted-foreground">
                          {o.hint}
                        </span>
                      )}
                    </span>
                    {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              ))
            )}
          </ul>

          {rodape && (
            <p className="border-t border-border px-3 py-2 txt-apoio text-muted-foreground">
              {rodape}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
