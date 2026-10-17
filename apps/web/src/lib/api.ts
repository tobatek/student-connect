import type { ApiErrorBody } from '@students-connect/contracts';

/**
 * Klien HTTP tipis ke backend Loco.
 * - Autentikasi lewat cookie HttpOnly (`credentials: 'include'`); tidak ada token di JS/localStorage.
 * - Token CSRF (didapat dari /api/auth/me) dikirim di header untuk metode yang mengubah state.
 */

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/** Mode demo (frontend saja): permintaan dijawab server tiruan di browser. */
export const MOCK = import.meta.env.VITE_MOCK === 'true';

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};

export const SESSION_EXPIRED_EVENT = 'sc:session-expired';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.description ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error ?? 'error';
    this.fieldErrors = body?.errors ?? {};
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** Jangan picu event "sesi berakhir" saat 401 (mis. login/me). */
  quiet401?: boolean;
}

const FALLBACK: Record<number, string> = {
  400: 'Permintaan tidak valid.',
  401: 'Sesi berakhir. Silakan masuk kembali.',
  403: 'Anda tidak memiliki izin untuk aksi ini.',
  404: 'Data tidak ditemukan.',
  409: 'Terjadi konflik data. Muat ulang lalu coba lagi.',
  413: 'Berkas terlalu besar.',
  422: 'Data tidak dapat diproses.',
  429: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
  502: 'Layanan eksternal tidak dapat dihubungi.',
};

export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let response: Response;
  if (import.meta.env.VITE_MOCK === 'true') {
    const { mockRequest } = await import('@/mock/server');
    const r = await mockRequest(method, path, options.body, csrfToken);
    response = new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  } else {
    try {
      response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body,
        credentials: 'include',
        signal: options.signal,
        cache: 'no-store',
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new ApiError(0, null, 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    }
  }

  if (response.status === 401 && !options.quiet401) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!response.ok) {
    let parsed: ApiErrorBody | null = null;
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      parsed = null;
    }
    throw new ApiError(response.status, parsed, FALLBACK[response.status] ?? 'Terjadi kesalahan pada server.');
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const qs = (params: Record<string, string | number | undefined | null>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** Pesan galat yang aman ditampilkan ke pengguna. */
export const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Terjadi kesalahan tak terduga.';
