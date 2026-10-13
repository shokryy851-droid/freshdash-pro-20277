import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { AppRole, ProfileRow } from '@/types/database';

interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  role: AppRole | null;
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, profile: null, role: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((err: unknown) => console.error('[auth] getSession failed', err))
      .finally(() => setSessionReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', userId!).single())
  });

  const profile = (profileQuery.data as ProfileRow | undefined) ?? null;
  const value: AuthState = {
    session,
    profile,
    role: profile?.is_active ? profile.role : null,
    ready: sessionReady && (!userId || !profileQuery.isPending)
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);

/** UI convenience only — the database enforces the real permission. */
export const STAFF_ROLES: readonly AppRole[] = ['super_admin', 'admin', 'manager', 'sales', 'warehouse', 'driver', 'viewer'];
