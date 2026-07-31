import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/** Altura máxima da lista — precisa bater com o `max-h-64` da `<ul>`. */
const LISTA_MAX_PX = 256;

export interface ComboboxOption {
  valor: string;
  /** Sigla ou apelido que também encontra a opção ao digitar. */
  busca?: string;
}

interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Texto sob o campo quando o valor digitado não está na lista. */
  avisoForaDaLista?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Campo de texto com sugestões — o valor digitado vale mesmo fora da lista.
 *
 * QUANDO USAR ESTE E QUANDO USAR `SearchSelect`
 * - `SearchSelect`: o valor **tem** de ser um dos itens (um apartamento, um
 *   morador). Escolher fora da lista não faz sentido — o id não existiria.
 * - `Combobox` (este): a lista é atalho, não regra. Transportadora é o caso: as
 *   principais estão listadas para o porteiro não digitar "correios" de três
 *   jeitos, mas a transportadora regional que só atende aquele bairro precisa
 *   caber. Lista fechada aqui faria o porteiro escolher a errada ou deixar
 *   vazio — os dois piores desfechos para quem depois lê o relatório.
 *
 * Por isso o gatilho é um `Input` de verdade, e não um botão como no
 * `SearchSelect`: o que está no campo É o valor, sempre.
 *
 * Teclado: ↓/↑ percorre, Enter escolhe a destacada, Esc fecha sem mexer no que
 * foi digitado. Sem gesto nenhum — a lista abre ao focar e pela seta.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  avisoForaDaLista,
  id,
  disabled,
  className,
}: ComboboxProps) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [paraCima, setParaCima] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const idAuto = useId();
  const idLista = `${id ?? idAuto}-lista`;

  const naLista = options.some((o) => o.valor.toLowerCase() === value.trim().toLowerCase());

  const filtradas = useMemo(() => {
    const t = value.trim().toLowerCase();
    // Valor já escolhido: mostra a lista inteira, senão trocar de opção exigiria
    // apagar o campo antes — passo a mais para quem está de pé na portaria.
    if (!t || naLista) return options;
    const casa = (o: ComboboxOption, fn: (s: string) => boolean) =>
      fn(o.valor.toLowerCase()) || (o.busca ? fn(o.busca.toLowerCase()) : false);
    // Prefixo primeiro (é como se digita um nome); "contém" como respiro, para
    // "express" ainda achar "Total Express".
    const porPrefixo = options.filter((o) => casa(o, (s) => s.startsWith(t)));
    return porPrefixo.length > 0 ? porPrefixo : options.filter((o) => casa(o, (s) => s.includes(t)));
  }, [options, value, naLista]);

  useEffect(() => {
    if (!aberto) return;

    // No celular o campo fica no meio de um formulário longo e o teclado come a
    // metade de baixo da tela: lista para baixo nasceria escondida. Se não cabe
    // embaixo mas cabe em cima, abre para cima. `visualViewport` é o que enxerga
    // o teclado — `innerHeight` não muda quando ele sobe no iOS.
    const medir = () => {
      const caixa = containerRef.current?.getBoundingClientRect();
      if (!caixa) return;
      const alturaVisivel = window.visualViewport?.height ?? window.innerHeight;
      const abaixo = alturaVisivel - caixa.bottom;
      setParaCima(abaixo < LISTA_MAX_PX && caixa.top > abaixo);
    };
    medir();

    const aoClicarFora = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', aoClicarFora);
    window.visualViewport?.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      window.visualViewport?.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [aberto]);

  // Mantém a opção destacada visível ao percorrer com o teclado.
  useEffect(() => {
    listaRef.current?.children[destaque]?.scrollIntoView({ block: 'nearest' });
  }, [destaque]);

  const escolher = (v: string) => {
    onValueChange(v);
    setAberto(false);
  };

  /** Abre já destacando o que está escolhido — não o primeiro da lista. */
  const abrir = () => {
    const i = filtradas.findIndex((o) => o.valor.toLowerCase() === value.trim().toLowerCase());
    setDestaque(i >= 0 ? i : 0);
    setAberto(true);
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      setDestaque((i) => (i + passo + filtradas.length) % Math.max(filtradas.length, 1));
      return;
    }
    // Enter só confirma a sugestão destacada; sem lista aberta, deixa o
    // formulário seguir com o que foi digitado.
    if (e.key === 'Enter' && aberto && filtradas[destaque]) {
      e.preventDefault();
      escolher(filtradas[destaque].valor);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      // Sair do campo com Tab tem de fechar a lista: senão ela fica pairando por
      // cima do campo seguinte do formulário. `relatedTarget` diz para onde o
      // foco foi — nulo (clique fora, troca de aba) também fecha.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <div className="relative">
        <Input
          ref={campoRef}
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={aberto && filtradas[destaque] ? `${idLista}-${destaque}` : undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setAberto(true);
            setDestaque(0);
          }}
          onFocus={abrir}
          // Também no clique: depois de escolher uma opção o campo continua
          // focado, então só o `onFocus` não reabriria a lista — tocar no campo
          // pareceria não fazer nada.
          onClick={abrir}
          onKeyDown={aoTeclar}
          className="pr-9"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={aberto ? 'Fechar sugestões' : 'Ver sugestões'}
          disabled={disabled}
          // Devolve o foco ao campo: sem isso, quem abre pela seta não consegue
          // percorrer a lista com o teclado logo em seguida.
          onClick={() => {
            campoRef.current?.focus();
            if (aberto) setAberto(false);
            else abrir();
          }}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        </button>
      </div>

      {aberto && filtradas.length > 0 && (
        <ul
          ref={listaRef}
          id={idLista}
          role="listbox"
          className={cn(
            'absolute z-50 max-h-64 w-full overflow-y-auto overscroll-contain rounded-md border border-border bg-popover py-1 shadow-lg',
            paraCima ? 'bottom-full mb-1' : 'mt-1',
          )}
        >
          {filtradas.map((o, i) => {
            const escolhida = o.valor.toLowerCase() === value.trim().toLowerCase();
            return (
              // `presentation` no <li>: sem isso o `listitem` implícito entra
              // entre o listbox e a option e quebra a relação para o leitor de tela.
              <li key={o.valor} role="presentation">
                <button
                  type="button"
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={escolhida}
                  // O foco tem de continuar no campo: o `onBlur` do container
                  // fecharia a lista antes do clique virar escolha.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => escolher(o.valor)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left txt-corpo',
                    i === destaque && 'bg-accent',
                    escolhida && 'font-medium',
                  )}
                >
                  <span className="truncate">{o.valor}</span>
                  {escolhida && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {avisoForaDaLista && value.trim() !== '' && !naLista && (
        <p className="mt-1.5 txt-apoio text-muted-foreground">{avisoForaDaLista}</p>
      )}
    </div>
  );
}
