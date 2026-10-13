import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { AppRole } from '@/types/database';
import { LoadingState, EmptyState } from '@/ui/States';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: readonly AppRole[] }) {
  const { session, role, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <LoadingState />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && (!role || !roles.includes(role))) {
    return <EmptyState title="ليست لديك صلاحية لهذه الصفحة" />;
  }
  return <>{children}</>;
}
