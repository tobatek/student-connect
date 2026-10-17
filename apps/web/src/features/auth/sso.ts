import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SsoConfig {
  enabled: boolean;
  login_url: string;
  password_login_enabled: boolean;
}

/** Kode `?sso_error=` dari backend (`controllers/sso.rs`) -> pesan untuk pengguna. */
const SSO_ERRORS: Record<string, string> = {
  disabled: 'Login lewat Portal belum diaktifkan di aplikasi ini.',
  state: 'Sesi login Portal tidak valid atau sudah kedaluwarsa. Mulai lagi dari tombol Login dengan Portal.',
  invalid: 'Kode login dari Portal tidak valid atau sudah kedaluwarsa. Coba masuk lagi.',
  unavailable: 'Portal tidak dapat dihubungi. Coba lagi sebentar lagi.',
  unregistered: 'Akun Portal Anda belum terdaftar di aplikasi ini. Hubungi admin kampus.',
  inactive: 'Akun Anda dinonaktifkan di aplikasi ini. Hubungi admin kampus.',
  rate: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',
};

export const ssoErrorMessage = (code: string | null): string | null =>
  code ? (SSO_ERRORS[code] ?? 'Login lewat Portal gagal. Coba lagi atau hubungi admin kampus.') : null;

/**
 * Status SSO dari backend. Galat (server lama, mode demo) dianggap "SSO tidak aktif"
 * supaya halaman masuk tetap berfungsi dengan form sandi.
 */
export function useSsoConfig() {
  return useQuery({
    queryKey: ['sso-config'],
    queryFn: () => api<SsoConfig>('/api/sso/config', { quiet401: true }),
    staleTime: 60_000,
    retry: false,
  });
}
