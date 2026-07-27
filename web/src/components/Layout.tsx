import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearToken } from '../api/client';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, PackagePlus, Building2, Users, HardHat, Building,
  Menu, LogOut, Sun, Moon, Laptop, BarChart3, Car, Megaphone, ListChecks,
  PanelLeftClose, PanelLeftOpen, Download, MessageCircle, LayoutDashboard,
  Briefcase, ArrowLeftRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import {
  useAuthMe,
  useCondominioAtivo,
  useModuleEnabled,
  useTrocarCondominio,
  type TenantModule,
} from '@/hooks/use-tenant-config';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from '@/hooks/use-theme';
import { APP_VERSION } from '@/lib/versao';

const COLLAPSE_KEY = 'chegou.sidebar.collapsed';

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administradora',
  porteiro: 'Porteiro',
};

type NavItem = {
  path: string;
  label: string;
  icon: typeof Package;
  roles: string[];
  end?: boolean;
  group: string;
  /** Só aparece se o superadmin habilitou este módulo no condomínio. */
  modulo?: TenantModule;
  /** Funciona sem condomínio escolhido — vale para a carteira da administradora. */
  semCondominio?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['sindico', 'admin'], group: 'Portaria' },
  { path: '/', label: 'Encomendas', icon: Package, roles: ['porteiro', 'sindico', 'admin'], end: true, group: 'Portaria' },
  { path: '/encomendas/nova', label: 'Nova encomenda', icon: PackagePlus, roles: ['porteiro', 'sindico', 'admin'], group: 'Portaria' },
  { path: '/apartamentos', label: 'Apartamentos', icon: Building2, roles: ['sindico', 'admin'], group: 'Condomínio' },
  { path: '/moradores', label: 'Moradores', icon: Users, roles: ['sindico', 'admin'], group: 'Condomínio' },
  { path: '/equipe', label: 'Equipe', icon: HardHat, roles: ['sindico', 'admin'], group: 'Condomínio' },
  { path: '/vagas', label: 'Vagas', icon: Car, roles: ['sindico', 'admin'], group: 'Condomínio', modulo: 'vagas' },
  { path: '/avisos', label: 'Avisos', icon: Megaphone, roles: ['sindico', 'admin'], group: 'Comunicação', modulo: 'avisos' },
  { path: '/notificacoes', label: 'Filas', icon: ListChecks, roles: ['sindico', 'admin'], group: 'Comunicação' },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['sindico', 'admin'], group: 'Comunicação' },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['sindico', 'admin'], group: 'Comunicação' },
  { path: '/meus-condominios', label: 'Meus condomínios', icon: Briefcase, roles: ['admin'], group: 'Carteira', semCondominio: true },
  { path: '/admin', label: 'Condomínios', icon: Building, roles: ['superadmin'], end: true, group: 'Plataforma' },
  { path: '/admin/administradoras', label: 'Administradoras', icon: Briefcase, roles: ['superadmin'], group: 'Plataforma' },
  { path: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle, roles: ['superadmin'], group: 'Plataforma' },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', compact && 'justify-center')}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-xs">
        <img src="/logo-mark.png" alt="Chegou" className="h-6 w-6" />
      </div>
      {!compact && (
        <div className="leading-none">
          <span className="text-lg font-extrabold tracking-tight text-foreground">chegou</span>
          <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">central</span>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { data: user } = useAuthMe();
  const nav = useNavigate();
  const location = useLocation();
  const { setTheme } = useTheme();
  const { canInstall, isIOS, promptInstall } = useInstallPrompt();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === '1');

  const condominioAtivo = useCondominioAtivo();
  const trocarCondominio = useTrocarCondominio();

  // Módulos opcionais: mesma query do /auth/me, sem request extra.
  const vagasAtivo = useModuleEnabled('vagas');
  const avisosAtivo = useModuleEnabled('avisos');
  const modulosAtivos: Record<TenantModule, boolean | undefined> = {
    vagas: vagasAtivo,
    avisos: avisosAtivo,
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const logout = () => {
    clearToken();
    nav('/login', { replace: true });
  };

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall();
    } else if (isIOS) {
      toast('Instalar no iPhone/iPad', {
        description: 'Toque no botão Compartilhar do Safari e escolha "Adicionar à Tela de Início".',
        duration: 8000,
      });
    }
  };

  const userRole = user?.role || '';
  // Módulo com estado desconhecido fica escondido: melhor aparecer depois do
  // que oferecer uma tela que o condomínio não contratou.
  // Administradora que ainda não escolheu condomínio só vê a carteira: as
  // outras telas não teriam de onde carregar dado.
  const semCondominioEscolhido = userRole === 'admin' && !condominioAtivo.id;
  const filteredNavItems = NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(userRole) &&
      (!item.modulo || modulosAtivos[item.modulo] === true) &&
      (!semCondominioEscolhido || item.semCondominio),
  );
  const groups = filteredNavItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group] ??= []).push(item);
    return acc;
  }, {});

  const initials = user?.nome?.substring(0, 2).toUpperCase() || 'U';
  const showTenant = !user?.role.includes('superadmin');
  const ehAdministradora = user?.role === 'admin';
  const nomeCondominio = condominioAtivo.nome ?? user?.tenantNome ?? '—';

  // isCollapsed só vale no desktop; no Sheet (mobile) sempre expandido.
  const SidebarBody = ({ onClick, isCollapsed = false }: { onClick?: () => void; isCollapsed?: boolean }) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className={cn('flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4', isCollapsed ? 'px-2 items-center' : 'px-3')}>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className={cn('flex w-full flex-col gap-1', isCollapsed && 'items-center')}>
            {isCollapsed
              ? <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden />
              : <p className="eyebrow px-3 pb-1">{group}</p>}
            {items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onClick}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-xl font-medium transition-colors',
                    isCollapsed ? 'h-11 w-11 justify-center' : 'min-h-[44px] gap-3 px-3 py-2.5 text-[15px]',
                    isActive
                      ? 'bg-primary font-semibold text-primary-foreground shadow-xs'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Sem condomínio escolhido não há o que rotular nem de onde sair. */}
      {showTenant && !isCollapsed && (condominioAtivo.id || !ehAdministradora) && (
        <div className="space-y-2 px-3 pt-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 px-3 py-2.5">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="eyebrow">Condomínio</p>
              <p className="truncate text-sm font-medium text-foreground">{nomeCondominio}</p>
            </div>
          </div>
          {/* A administradora atende vários: precisa saber em qual está e poder sair. */}
          {ehAdministradora && (
            <Button
              variant="outline"
              onClick={() => {
                trocarCondominio(null);
                nav('/meus-condominios');
                setIsMobileMenuOpen(false);
              }}
              className="min-h-[48px] w-full justify-start gap-3"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Trocar de condomínio
            </Button>
          )}
        </div>
      )}

      {/* Versão do build que está rodando — junto do condomínio de propósito:
          é o que o suporte pergunta primeiro quando algo não bate. */}
      <div className={cn('p-3', isCollapsed && 'flex justify-center')}>
        <p
          className="font-mono text-[11px] text-muted-foreground"
          title={`Chegou versão ${APP_VERSION}`}
        >
          v{APP_VERSION}
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Desktop sidebar — largura anima entre expandida e recolhida */}
      <aside
        className={cn(
          'hidden h-screen shrink-0 flex-col transition-[width] duration-200 md:flex',
          collapsed ? 'w-[76px]' : 'w-64'
        )}
      >
        <div className={cn('relative flex h-16 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
          {!collapsed && <div className="panel-grid panel-grid-fade pointer-events-none absolute inset-0 opacity-40" aria-hidden />}
          <div className="relative"><BrandMark compact={collapsed} /></div>
        </div>

        <SidebarBody isCollapsed={collapsed} />

        {/* Botão recolher/expandir */}
        <div className={cn('shrink-0 border-t border-sidebar-border p-2', collapsed && 'flex justify-center')}>
          <Button
            variant="ghost"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn('text-muted-foreground', collapsed ? 'h-11 w-11 p-0' : 'w-full justify-start gap-3 px-3')}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            {!collapsed && <span>Recolher menu</span>}
          </Button>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — mesma superfície do sidebar, sem divisórias */}
        <header className="flex h-16 shrink-0 items-center justify-between px-4 md:justify-end md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Abrir menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[300px] flex-col border-sidebar-border bg-sidebar p-0 sm:max-w-[300px]">
                <SheetHeader className="shrink-0 p-5 text-left">
                  <SheetTitle asChild>
                    <div><BrandMark /></div>
                  </SheetTitle>
                </SheetHeader>
                <SidebarBody onClick={() => setIsMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
            <BrandMark compact />
          </div>

          <div className="flex items-center gap-3">
            {showTenant && (
              <span className="hidden max-w-[200px] items-center gap-1.5 truncate text-sm font-medium text-muted-foreground lg:inline-flex">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {nomeCondominio}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0" aria-label="Conta">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className="bg-muted font-mono text-sm font-semibold text-foreground">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold leading-none">{user?.nome}</p>
                    <p className="eyebrow">{ROLE_LABEL[userRole] ?? userRole}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {(canInstall || isIOS) && (
                  <>
                    <DropdownMenuItem onClick={handleInstall}>
                      <Download className="mr-2 h-4 w-4" /><span>Instalar app</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span>Tema</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setTheme("light")}>
                        <Sun className="mr-2 h-4 w-4" /><span>Claro</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("dark")}>
                        <Moon className="mr-2 h-4 w-4" /><span>Escuro</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("system")}>
                        <Laptop className="mr-2 h-4 w-4" /><span>Sistema</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /><span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile tenant info */}
        {showTenant && (
          <div className="flex items-center gap-2 px-4 pb-1 md:hidden">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium text-muted-foreground">{nomeCondominio}</span>
          </div>
        )}

        {/* Painel flutuante com o conteúdo das rotas */}
        <main className="min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3">
          <div className="h-full overflow-y-auto overflow-x-hidden rounded-2xl border border-border bg-background shadow-panel-lg">
            <div className="p-4 md:p-6 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="w-full"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
