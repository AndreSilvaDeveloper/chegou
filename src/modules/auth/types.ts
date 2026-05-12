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
  tenantId: string | null;
  tenantNome: string | null;
  role: UserRole;
  nome: string;
  email: string;
}
