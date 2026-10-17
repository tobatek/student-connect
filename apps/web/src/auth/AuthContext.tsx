import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Me, Permission } from '@students-connect/contracts';
import { Spinner } from '@/components/ui/Feedback';
import { api, ApiError, SESSION_EXPIRED_EVENT, setCsrfToken } from '@/lib/api';

interface AuthState {
  me: Me;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<Me>;
  changePassword: (current: string, next: string) => Promise<Me>;
  logout: () => Promise<void>;
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: AuthState['login'];
  changePassword: AuthState['changePassword'];
  logout: AuthState['logout'];
}

const Ctx = createContext<AuthContextValue | null>(null);
const ME_KEY = ['me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api<Me>('/api/auth/me', { quiet401: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const me = meQuery.data ?? null;
  useEffect(() => {
    setCsrfToken(me?.csrf_token ?? null);
  }, [me]);

  // Sesi berakhir di sisi server (idle/dicabut): bersihkan semua cache agar tidak ada data tertinggal.
  useEffect(() => {
    const onExpired = () => {
      setCsrfToken(null);
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [qc]);

  const adopt = useCallback(
    (next: Me) => {
      setCsrfToken(next.csrf_token);
      qc.setQueryData(ME_KEY, next);
      return next;
    },
    [qc],
  );

  const login = useCallback<AuthState['login']>(
    async (email, password) => adopt(await api<Me>('/api/auth/login', { method: 'POST', body: { email, password }, quiet401: true })),
    [adopt],
  );

  const changePassword = useCallback<AuthState['changePassword']>(
    async (current_password, new_password) =>
      adopt(await api<Me>('/api/auth/change-password', { method: 'POST', body: { current_password, new_password } })),
    [adopt],
  );

  const logout = useCallback<AuthState['logout']>(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken(null);
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    }
  }, [qc]);

  const value = useMemo<AuthContextValue>(
    () => ({ me, loading: meQuery.isPending, login, changePassword, logout }),
    [me, meQuery.isPending, login, changePassword, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}

/** Pengguna terautentikasi (hanya di dalam <RequireAuth>). Izin hanya untuk menyembunyikan UI; backend tetap memeriksa. */
export function useAuth(): AuthState {
  const { me, login, changePassword, logout } = useAuthContext();
  if (!me) throw new Error('useAuth dipakai tanpa sesi');
  return useMemo(
    () => ({ me, can: (p: Permission) => me.permissions.includes(p), login, changePassword, logout }),
    [me, login, changePassword, logout],
  );
}

export function RequireAuth({ children, allowTemporaryPassword = false }: { children: ReactNode; allowTemporaryPassword?: boolean }) {
  const { me, loading } = useAuthContext();
  const location = useLocation();
  if (loading) return <Spinner className="min-h-dvh" label="Memeriksa sesi…" />;
  if (!me) return <Navigate to="/masuk" replace state={{ from: location.pathname + location.search }} />;
  if (me.user.must_change_password && !allowTemporaryPassword) return <Navigate to="/ganti-sandi" replace />;
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
