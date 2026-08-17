import { Navigate } from 'react-router-dom';
import { getTenantAtivo, getToken, getUser } from '../api/client';
import { useModuleGate, type TenantModule } from '@/hooks/use-tenant-config';
import { rotaInicial } from '@/lib/rota-inicial';
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
  // Perfil sem acesso volta para a PRÓPRIA tela inicial, não para encomendas:
  // mandar o superadmin para uma tela de condomínio o deixava preso num lugar
  // que ele não opera (e que ele consegue abrir, porque `/encomendas` não
  // declara `allowedRoles`). Não há laço possível — a tela inicial de cada
  // perfil é, por construção, uma que ele pode abrir.
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={rotaInicial(user)} replace />;
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
    // Módulo não contratado: mesma regra do perfil sem acesso.
    if (gate === 'negado') return <Navigate to={rotaInicial(user)} replace />;
  }

  return <>{children}</>;
}
