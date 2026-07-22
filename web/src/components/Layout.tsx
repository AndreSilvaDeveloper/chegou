import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, AuthenticatedUser, clearToken, getUser, setUser } from '../api/client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, PackagePlus, Building2, Users, HardHat, Building, 
  Menu, LogOut, Sun, Moon, Laptop, BarChart3, Car, Megaphone, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administrador',
  porteiro: 'Porteiro',
};

const NAV_ITEMS = [
  { path: '/', label: 'Encomendas', icon: Package, roles: ['porteiro', 'sindico', 'admin'], end: true },
  { path: '/encomendas/nova', label: 'Nova Encomenda', icon: PackagePlus, roles: ['porteiro', 'sindico', 'admin'] },
  { path: '/apartamentos', label: 'Apartamentos', icon: Building2, roles: ['sindico', 'admin'] },
  { path: '/moradores', label: 'Moradores', icon: Users, roles: ['sindico', 'admin'] },
  { path: '/equipe', label: 'Equipe', icon: HardHat, roles: ['sindico', 'admin'] },
  { path: '/vagas', label: 'Vagas', icon: Car, roles: ['sindico', 'admin'] },
  { path: '/avisos', label: 'Avisos', icon: Megaphone, roles: ['sindico', 'admin'] },
  { path: '/notificacoes', label: 'Fila (WhatsApp)', icon: Bell, roles: ['sindico', 'admin'] },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['sindico', 'admin'] },
  { path: '/admin', label: 'Condomínios', icon: Building, roles: ['superadmin'] },
];

export function Layout() {
  const [user, setUserState] = useState<AuthenticatedUser | null>(getUser());
  const nav = useNavigate();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.get<AuthenticatedUser>('/auth/me')
      .then((u) => { setUser(u); setUserState(u); })
      .catch(() => {});
  }, []);

  const logout = () => {
    clearToken();
    nav('/login', { replace: true });
  };

  const userRole = user?.role || '';
  const filteredNavItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));

  const initials = user?.nome?.substring(0, 2).toUpperCase() || 'U';

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <div className="flex flex-col gap-2 p-4">
      {filteredNavItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          onClick={onClick}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors min-h-[48px]",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <span className="text-xl font-bold tracking-tight text-primary">📦 chegou</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavLinks />
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:justify-end md:px-6">
          {/* Mobile menu trigger */}
          <div className="flex items-center md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] p-0 sm:max-w-[300px]">
                <SheetHeader className="border-b p-6 text-left">
                  <SheetTitle className="text-xl font-bold tracking-tight text-primary">
                    📦 chegou
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-4">
                  <NavLinks onClick={() => setIsMobileMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="ml-4 text-lg font-bold tracking-tight text-primary md:hidden">chegou</span>
          </div>

          {/* User profile / context */}
          <div className="flex items-center gap-4">
            {!user?.role.includes('superadmin') && (
              <span className="hidden text-sm font-medium text-muted-foreground md:inline-block">
                🏢 {user?.tenantNome ?? 'Condomínio'}
              </span>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.nome}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {ROLE_LABEL[userRole] ?? userRole}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span>Tema</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onClick={() => setTheme("light")}>
                        <Sun className="mr-2 h-4 w-4" />
                        <span>Claro</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("dark")}>
                        <Moon className="mr-2 h-4 w-4" />
                        <span>Escuro</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTheme("system")}>
                        <Laptop className="mr-2 h-4 w-4" />
                        <span>Sistema</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile Tenant Info */}
        {!user?.role.includes('superadmin') && (
          <div className="flex items-center justify-center border-b bg-muted/50 px-4 py-2 md:hidden">
            <span className="text-xs font-medium text-muted-foreground truncate">
              🏢 {user?.tenantNome ?? 'Condomínio'}
            </span>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mx-auto max-w-6xl"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
