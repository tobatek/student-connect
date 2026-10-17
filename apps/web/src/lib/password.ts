/** Cermin kebijakan kata sandi backend (apps/server/src/security/password.rs) untuk umpan balik instan. */

export interface PasswordCheck {
  label: string;
  ok: boolean;
}

export const checkPassword = (password: string, email = ''): PasswordCheck[] => {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return [
    { label: 'Minimal 12 karakter', ok: password.length >= 12 },
    { label: 'Huruf besar dan huruf kecil', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Minimal satu angka', ok: /\d/.test(password) },
    { label: 'Minimal satu simbol', ok: /[^\p{L}\p{N}]/u.test(password) },
    { label: 'Tidak memuat bagian email', ok: local.length < 4 || !password.toLowerCase().includes(local) },
  ];
};

export const isStrong = (password: string, email = ''): boolean => checkPassword(password, email).every((c) => c.ok);
