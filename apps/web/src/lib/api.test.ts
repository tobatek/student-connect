import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SESSION_EXPIRED_EVENT, api, qs, setCsrfToken } from './api';

const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe('api()', () => {
  it('mengirim cookie dan CSRF hanya pada metode yang mengubah state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => respond(200, { ok: true }));
    setCsrfToken('tok-123');

    await api('/api/dashboard');
    await api('/api/records/rekognisi', { method: 'POST', body: { a: 1 } });

    const [, get] = fetchMock.mock.calls[0] ?? [];
    const [, post] = fetchMock.mock.calls[1] ?? [];
    expect((get?.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
    expect((post?.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok-123');
    expect(post?.credentials).toBe('include');
    expect(post?.body).toBe('{"a":1}');
  });

  it('mengubah galat validasi backend menjadi ApiError per-field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(400, { error: 'validation', description: 'Data tidak valid.', errors: { nama: 'Wajib diisi' } }));
    const error = await api('/x', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).fieldErrors).toEqual({ nama: 'Wajib diisi' });
  });

  it('memicu event sesi berakhir pada 401 kecuali quiet401', async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(401, { error: 'unauthorized' }));

    await api('/api/dashboard').catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);

    await api('/api/auth/me', { quiet401: true }).catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('memberi pesan ramah saat jaringan gagal', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/x')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('terhubung') });
  });

  it('qs membuang nilai kosong dan meng-encode', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(qs({})).toBe('');
  });
});
