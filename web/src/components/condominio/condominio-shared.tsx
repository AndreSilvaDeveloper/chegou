import { ComponentType } from 'react';
import { Blend, Building2, Home, Layers, Store } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { TenantConfig, TenantTipo } from '@/api/types';

/**
 * Peças da tela "gerenciar condomínio", usadas por dois perfis.
 *
 * O superadmin (`SuperAdmin` → `SuperAdminTenant`) e a administradora
 * (`MeusCondominios` → `MeuCondominio`) configuram o mesmo condomínio com
 * poderes diferentes. O que muda é **o que cada um pode salvar**, não a
 * aparência — por isso a aparência mora aqui, e não copiada nas duas telas.
 */

export const DEFAULT_CONFIG: Required<TenantConfig> = {
  tipo: 'residencial',
  estruturaBlocos: 'unico',
  moduloVagas: false,
  moduloAvisos: false,
  horarioEnvioInicio: '08:00',
  horarioEnvioFim: '21:00',
};

export const TIPO_META: Record<
  TenantTipo,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  residencial: { label: 'Residencial', icon: Home },
  comercial: { label: 'Comercial', icon: Store },
  misto: { label: 'Misto', icon: Blend },
};

export const ESTRUTURA_META: Record<
  NonNullable<TenantConfig['estruturaBlocos']>,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  unico: { label: 'Bloco único', icon: Building2 },
  multiplos: { label: 'Múltiplos blocos', icon: Layers },
};

/**
 * Escolher o tipo já sugere a estrutura de blocos, que é quem realmente manda
 * no cadastro de unidades. Comercial costuma ser bloco único; residencial e
 * misto, múltiplos. Dá para trocar depois — prédio residencial de torre única
 * existe.
 */
export function estruturaSugerida(tipo: TenantTipo): NonNullable<TenantConfig['estruturaBlocos']> {
  return tipo === 'comercial' ? 'unico' : 'multiplos';
}

/** Cartão selecionável (segmented control) — touch target grande, sem dropdown. */
export function OptionCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
        active
          ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/20'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

/** Linha de módulo com Switch — a linha inteira é clicável. */
export function ModuleToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors',
          checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </button>
  );
}

/**
 * A mesma linha do `ModuleToggle`, mas só de leitura.
 *
 * Existe para a administradora **ver** o módulo em vez de não ver nada: uma
 * seção que some deixa a impressão de que o recurso não existe, e o cliente
 * abre chamado perguntando por Vagas. Assim ele aparece, com o estado real e
 * com quem procurar para mudá-lo.
 */
export function ModuleReadonly({
  icon: Icon,
  title,
  description,
  checked,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
          checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          'shrink-0 font-mono text-[11px] uppercase tracking-wider',
          checked ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {checked ? 'Ativo' : 'Inativo'}
      </span>
    </div>
  );
}

export function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-background/60 px-3 py-2 backdrop-blur">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
