import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken, getUser } from '../api/client';

export function Layout() {
  const user = getUser();
  const nav = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'sindico';
  const isSuper = user?.role === 'superadmin';

  const logout = () => {
    clearToken();
    nav('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="font-semibold text-brand-700 text-lg">📦 Portaria</Link>
          <nav className="flex items-center gap-1 text-sm">
            {isSuper ? (
              <NavLink to="/admin" className={({ isActive }) =>
                `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                Condomínios
              </NavLink>
            ) : (
              <>
                <NavLink to="/" end className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                  Encomendas
                </NavLink>
                {isAdmin && (
                  <>
                    <NavLink to="/apartamentos" className={({ isActive }) =>
                      `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                      Apartamentos
                    </NavLink>
                    <NavLink to="/moradores" className={({ isActive }) =>
                      `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                      Moradores
                    </NavLink>
                    <NavLink to="/equipe" className={({ isActive }) =>
                      `px-3 py-1.5 rounded-md ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                      Equipe
                    </NavLink>
                  </>
                )}
              </>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600 hidden sm:inline">{user?.nome}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-800">Sair</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
