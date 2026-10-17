import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { Link, Navigate, Outlet, RouterProvider, createBrowserRouter, useRouteError, type RouteObject } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequirePermission } from '@/auth/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
});

/** Route berbasis code-splitting: tiap halaman menjadi chunk terpisah. */
const page = (load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">Terjadi kesalahan</h1>
        <p className="mt-2 text-slate-600">Halaman ini tidak dapat ditampilkan. Muat ulang, atau kembali ke dashboard.</p>
        <Link to="/" reloadDocument className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 font-bold text-white hover:bg-brand-800">
          Ke dashboard
        </Link>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-slate-600">Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 font-bold text-white hover:bg-brand-800">
        Ke dashboard
      </Link>
    </div>
  );
}

const guarded = (permission: 'logs.read' | 'audit.read', load: () => Promise<{ default: ComponentType }>): RouteObject => ({
  element: (
    <RequirePermission permission={permission}>
      <Outlet />
    </RequirePermission>
  ),
  children: [{ index: true, ...page(load) }],
});

const routes: RouteObject[] = [
  { path: '/masuk', ...page(() => import('@/features/auth/LoginPage')), errorElement: <RouteError /> },
  {
    path: '/ganti-sandi',
    element: (
      <RequireAuth allowTemporaryPassword>
        <Outlet />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [{ index: true, ...page(() => import('@/features/auth/ChangePasswordPage')) }],
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, ...page(() => import('@/features/dashboard/DashboardPage')) },
      { path: 'prestasi-mandiri', ...page(() => import('@/features/records/RecordsPage')) },
      { path: 'sertifikasi', ...page(() => import('@/features/records/RecordsPage')) },
      { path: 'rekognisi', ...page(() => import('@/features/records/RecordsPage')) },
      { path: 'kejuaraan', ...page(() => import('@/features/kejuaraan/KejuaraanPage')) },
      { path: 'prestasi-belmawa', ...page(() => import('@/features/belmawa/BelmawaPage')) },
      { path: 'institusi', ...page(() => import('@/features/institusi/InstitusiPage')) },
      { path: 'dokumen', ...page(() => import('@/features/documents/DocumentsPage')) },
      { path: 'antrean', ...guarded('logs.read', () => import('@/features/queue/QueuePage')) },
      { path: 'audit', ...guarded('audit.read', () => import('@/features/audit/AuditPage')) },
      { path: 'pengaturan', ...page(() => import('@/features/settings/SettingsPage')) },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
