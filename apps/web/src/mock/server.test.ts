import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, mockRequest, resetMock } from './server';

const call = (m: string, p: string, body?: unknown, csrf: string | null = null) => mockRequest(m, p, body, csrf);

describe('server tiruan (mode demo)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMock();
  });

  it('menolak akses tanpa sesi dan kredensial salah', async () => {
    expect((await call('GET', '/api/auth/me')).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { email: 'admin@demo.ac.id', password: 'salah' })).status).toBe(401);
  });

  it('login, dashboard, CSRF wajib, dan alur verifikasi sampai antrean', async () => {
    const login = await call('POST', '/api/auth/login', { email: 'admin@demo.ac.id', password: DEMO_PASSWORD });
    expect(login.status).toBe(200);
    const csrf = (login.body as { csrf_token: string }).csrf_token;

    expect((await call('GET', '/api/dashboard')).status).toBe(200);
    expect((await call('POST', '/api/auth/logout', {}, 'salah')).status).toBe(403);

    const list = await call('GET', '/api/records/prestasi-mandiri?status=VERIFIED');
    const item = (list.body as { items: { id: string }[] }).items[0];
    expect(item).toBeDefined();
    const queued = await call('POST', `/api/records/prestasi-mandiri/${item?.id}/queue`, undefined, csrf);
    expect(queued.status).toBe(200);
    expect((queued.body as { status: string }).status).toBe('QUEUED');
  });

  it('mahasiswa hanya melihat data miliknya', async () => {
    await call('POST', '/api/auth/login', { email: 'mhs@demo.ac.id', password: DEMO_PASSWORD });
    const res = await call('GET', '/api/records/prestasi-mandiri');
    const items = (res.body as { items: { nama: string }[] }).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => !i.nama.includes('Pemrograman Nasional'))).toBe(true);
  });
});
