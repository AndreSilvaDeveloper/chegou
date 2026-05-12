import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, AuthenticatedUser, clearToken, getUser, setUser } from '../api/client';

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin',
  sindico: 'Síndico',
  admin: 'Administrador',
  porteiro: 'Porteiro',
};

export function Layout() {
  const [user, setUserState] = useState<AuthenticatedUser | null>(getUser());
  const nav = useNavigate();

  // mantém o usuário (incl. nome do condomínio) atualizado e valida a sessão
  useEffect(() => {
    api.get<AuthenticatedUser>('/auth/me')
      .then((u) => { setUser(u); setUserState(u); })
      .catch(() => {});
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';
  const isSuper = user?.role === 'superadmin';

  const logout = () => {
    clearToken();
    nav('/login', { replace: true });
  };

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to={isSuper ? '/admin' : '/'} className="font-bold text-brand-700 text-lg tracking-tight whitespace-nowrap">
            📦 chegou
          </Link>
          <nav className="flex items-center gap-1 text-sm overflow-x-auto">
            {isSuper ? (
              <NavLink to="/admin" className={navClass}>Condomínios</NavLink>
            ) : (
              <>
                <NavLink to="/" end className={navClass}>Encomendas</NavLink>
                {isAdmin && (
                  <>
                    <NavLink to="/apartamentos" className={navClass}>Apartamentos</NavLink>
                    <NavLink to="/moradores" className={navClass}>Moradores</NavLink>
                    <NavLink to="/equipe" className={navClass}>Equipe</NavLink>
                  </>
                )}
              </>
            )}
          </nav>
          <button onClick={logout} className="text-sm text-slate-500 hover:text-slate-800 whitespace-nowrap">Sair</button>
        </div>
        {!isSuper && (
          <div className="bg-slate-50 border-t border-slate-200">
            <div className="max-w-5xl mx-auto px-4 py-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700 truncate">
                🏢 {user?.tenantNome ?? 'Condomínio'}
              </span>
              <span className="text-slate-500 truncate">
                {user?.nome}
                {user?.role && <span className="text-slate-400"> · {ROLE_LABEL[user.role] ?? user.role}</span>}
              </span>
            </div>
          </div>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
