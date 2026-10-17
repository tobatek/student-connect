import { describe, expect, it } from 'vitest';
import { checkPassword, isStrong } from './password';
import { formatBytes, formatDate, initials, safeHref } from './format';

describe('safeHref', () => {
  it('hanya meloloskan http(s)', () => {
    expect(safeHref('https://drive.example.ac.id/a.pdf')).toBe('https://drive.example.ac.id/a.pdf');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>1</script>')).toBeUndefined();
    expect(safeHref('//evil.example')).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
  });
});

describe('format', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formatDate menangani kosong dan tidak valid', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('bukan-tanggal')).toBe('—');
    expect(formatDate('2025-05-01')).toContain('2025');
  });

  it('initials', () => {
    expect(initials('Budi Santoso Putra')).toBe('BS');
    expect(initials('  ')).toBe('');
  });
});

describe('kebijakan kata sandi (cermin backend)', () => {
  it('menerima sandi kuat dan menolak yang lemah', () => {
    expect(isStrong('Tr0ub4dor&Horse!', 'budi@kampus.ac.id')).toBe(true);
    expect(isStrong('pendek1A!', 'a@b.id')).toBe(false);
    expect(isStrong('semuahurufkecilsaja', 'a@b.id')).toBe(false);
  });

  it('menolak sandi yang memuat bagian email', () => {
    const checks = checkPassword('Budisantoso123!', 'budisantoso@kampus.ac.id');
    expect(checks.find((c) => c.label.includes('email'))?.ok).toBe(false);
  });
});
