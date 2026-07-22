import { Navigate } from 'react-router-dom';
import { getToken, getUser } from '../api/client';

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;

  const user = getUser();
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
