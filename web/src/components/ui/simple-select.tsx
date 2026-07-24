import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu';

export interface SimpleSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface SimpleSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Select no estilo shadcn, construído sobre o Radix DropdownMenu (já instalado).
 * Trigger com a mesma aparência do Input; conteúdo com largura igual ao trigger.
 */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Selecione',
  className,
  id,
  disabled,
}: SimpleSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          className={cn(
            'flex h-12 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:ring-2 data-[state=open]:ring-ring',
            className,
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
      >
        {options.map((o) => (
          <DropdownMenuItem key={o.value || 'default'} onSelect={() => onValueChange(o.value)} className="gap-2">
            <Check className={cn('h-4 w-4 shrink-0 text-primary', value === o.value ? 'opacity-100' : 'opacity-0')} />
            <span className="flex-1 truncate">{o.label}</span>
            {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
