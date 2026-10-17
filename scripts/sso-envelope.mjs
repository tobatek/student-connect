#!/usr/bin/env node
// Alat uji amplop AES-256-GCM Portal SSO tanpa dependensi (Node >= 18).
// Implementasi independen dari kode Rust, mengikuti kontrak docs/15_SSO_PORTAL_VALIDASI_SEPARATION_PLAN.md:
//   kunci = HKDF-Expand(PRK = sha256(app_token), L = 32, info = "sso-verify-v1")
//   amplop = { nonce, ciphertext, tag } (base64), nonce 12 byte, tag 16 byte, tanpa AAD.
//
// Pemakaian (token dibaca dari variabel lingkungan agar tidak tersimpan di riwayat shell):
//   SSO_APP_TOKEN=... node scripts/sso-envelope.mjs seal '{"code":"KODE"}'
//   SSO_APP_TOKEN=... node scripts/sso-envelope.mjs open '{"nonce":"..","ciphertext":"..","tag":".."}'
//   SSO_APP_TOKEN=... node scripts/sso-envelope.mjs key        # kunci turunan (hex) untuk uji silang
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const INFO = Buffer.from('sso-verify-v1');

export function deriveKey(appToken) {
  const prk = createHash('sha256').update(appToken).digest();
  // HKDF-Expand untuk 32 byte = satu blok: T(1) = HMAC(PRK, info || 0x01).
  return createHmac('sha256', prk).update(Buffer.concat([INFO, Buffer.from([1])])).digest();
}

export function seal(key, plaintext, nonce = randomBytes(12)) {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function open(key, envelope) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [command, arg] = process.argv.slice(2);
  const token = process.env.SSO_APP_TOKEN;
  if (!token || !['seal', 'open', 'key'].includes(command ?? '')) {
    console.error('Pemakaian: SSO_APP_TOKEN=... node scripts/sso-envelope.mjs <seal|open|key> [json]');
    process.exit(2);
  }
  const key = deriveKey(token);
  if (command === 'key') console.log(key.toString('hex'));
  else if (command === 'seal') console.log(JSON.stringify(seal(key, Buffer.from(arg ?? '', 'utf8'))));
  else {
    try {
      console.log(open(key, JSON.parse(arg ?? '{}')).toString('utf8'));
    } catch {
      console.error('Gagal: tag tidak cocok (kunci salah atau payload diubah).');
      process.exit(1);
    }
  }
}
