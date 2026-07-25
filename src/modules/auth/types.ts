import { UserRole } from '../../database/entities';

export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  /** Vínculo fixo com um condomínio — só síndico e porteiro têm. */
  tenantId: string | null;
  tenantNome: string | null;
  /** Carteira de condomínios — só a administradora (`admin`) tem. */
  administradoraId: string | null;
  administradoraNome: string | null;
  role: UserRole;
  nome: string;
  email: string;
}

/** Condomínio em que a request está operando (resolvido pelo TenantScopeGuard). */
export interface TenantAtivo {
  id: string;
  nome: string;
}
