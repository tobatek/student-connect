import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/AuthContext';
import LoginPage from './LoginPage';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const setup = (entry = '/masuk') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <MemoryRouter initialEntries={[entry]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );

afterEach(() => vi.restoreAllMocks());

describe('LoginPage', () => {
  it('menampilkan pesan seragam saat kredensial salah dan mengosongkan kata sandi', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return json(401, { error: 'unauthorized' });
      return json(401, { error: 'unauthorized', description: 'rincian internal yang tidak boleh tampil' });
    });
    const user = userEvent.setup();
    setup();

    await user.click((await screen.findAllByRole('button', { name: /^masuk$/i }))[0]!);
    await user.type(await screen.findByLabelText(/email/i), 'budi@kampus.ac.id');
    const password = screen.getByLabelText(/^kata sandi/i);
    await user.type(password, 'salah-banget');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^masuk$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/email atau kata sandi salah/i);
    expect(alert).not.toHaveTextContent(/rincian internal/i);
    await waitFor(() => expect(password).toHaveValue(''));
  });

  it('tombol masuk nonaktif sampai kedua kolom terisi', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, {}));
    const user = userEvent.setup();
    setup();
    await user.click((await screen.findAllByRole('button', { name: /^masuk$/i }))[0]!);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /^masuk$/i })).toBeDisabled();
  });

  describe('Login dengan Portal', () => {
    const ssoFetch = (config: Record<string, unknown>) =>
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/sso/config')) return json(200, config);
        return json(401, { error: 'unauthorized' });
      });

    it('menampilkan tombol Portal sebagai navigasi penuh ke backend, form sandi tetap ada', async () => {
      ssoFetch({ enabled: true, login_url: '/api/sso/login', password_login_enabled: true });
      const user = userEvent.setup();
      setup();
      await user.click((await screen.findAllByRole('button', { name: /^masuk$/i }))[0]!);
      const link = await screen.findByRole('link', { name: /login dengan portal/i });
      expect(link).toHaveAttribute('href', '/api/sso/login');
      expect(within(screen.getByRole('dialog')).getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('menyembunyikan form sandi bila server mematikannya', async () => {
      ssoFetch({ enabled: true, login_url: '/api/sso/login', password_login_enabled: false });
      const user = userEvent.setup();
      setup();
      await user.click((await screen.findAllByRole('button', { name: /^masuk$/i }))[0]!);
      await screen.findByRole('link', { name: /login dengan portal/i });
      expect(within(screen.getByRole('dialog')).queryByLabelText(/email/i)).not.toBeInTheDocument();
    });

    it('tanpa SSO aktif tidak ada tombol Portal', async () => {
      ssoFetch({ enabled: false, login_url: '/api/sso/login', password_login_enabled: true });
      const user = userEvent.setup();
      setup();
      await user.click((await screen.findAllByRole('button', { name: /^masuk$/i }))[0]!);
      await within(screen.getByRole('dialog')).findByLabelText(/email/i);
      expect(screen.queryByRole('link', { name: /login dengan portal/i })).not.toBeInTheDocument();
    });

    it('membuka dialog dan menampilkan pesan saat kembali dari Portal dengan galat', async () => {
      ssoFetch({ enabled: true, login_url: '/api/sso/login', password_login_enabled: true });
      setup('/masuk?sso_error=unregistered');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/belum terdaftar/i);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
