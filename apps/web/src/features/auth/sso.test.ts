import { describe, expect, it } from 'vitest';
import { ssoErrorMessage } from './sso';

describe('ssoErrorMessage', () => {
  it('memetakan kode yang dikenal ke pesan Indonesia', () => {
    expect(ssoErrorMessage('unregistered')).toMatch(/belum terdaftar/i);
    expect(ssoErrorMessage('unavailable')).toMatch(/tidak dapat dihubungi/i);
  });

  it('kode tak dikenal memakai pesan umum dan tidak memantulkan nilainya', () => {
    const msg = ssoErrorMessage('<img src=x onerror=alert(1)>');
    expect(msg).toMatch(/gagal/i);
    expect(msg).not.toContain('<img');
  });

  it('tanpa kode berarti tidak ada galat', () => {
    expect(ssoErrorMessage(null)).toBeNull();
  });
});
