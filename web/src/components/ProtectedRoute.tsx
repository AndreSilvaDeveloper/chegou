import { Navigate } from 'react-router-dom';
import { getTenantAtivo, getToken, getUser } from '../api/client';
import { useModuleGate, type TenantModule } from '@/hooks/use-tenant-config';
import { Skeleton } from '@/components/ui/skeleton';

export function ProtectedRoute({
  children,
  allowedRoles,
  requiresModule,
  semCondominio,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
  /** Módulo opcional que precisa estar habilitado no condomínio. */
  requiresModule?: TenantModule;
  /** Rota que funciona sem condomínio escolhido (a carteira da administradora). */
  semCondominio?: boolean;
}) {
  // O hook precisa rodar sempre (regra dos hooks), mesmo sem requiresModule.
  const gate = useModuleGate(requiresModule ?? 'vagas');

  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;

  const user = getUser();
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/encomendas" replace />;
  }

  // A administradora não tem condomínio fixo: sem escolher um, as telas de
  // condomínio não têm o que carregar (e o backend recusaria). Manda escolher.
  if (user?.role === 'admin' && !semCondominio && !getTenantAtivo()) {
    return <Navigate to="/meus-condominios" replace />;
  }

  if (requiresModule) {
    if (gate === 'carregando') {
      return (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      );
    }
    if (gate === 'negado') return <Navigate to="/encomendas" replace />;
  }

  return <>{children}</>;
}
