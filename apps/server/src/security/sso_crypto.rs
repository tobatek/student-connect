//! Amplop AES-256-GCM untuk `/api/sso/verify` dan `/api/sso/session-status` Portal
//! (kontrak: `docs/15_SSO_PORTAL_VALIDASI_SEPARATION_PLAN.md`, "Autentikasi & enkripsi").
//!
//! * Kunci = `HKDF-Expand(PRK = sha256(app_token), L = 32, info = "sso-verify-v1")`.
//!   Tidak ada tahap Extract dan tidak ada salt: PRK adalah hash token itu sendiri.
//! * Amplop `{nonce, ciphertext, tag}`, semuanya base64 standar. Nonce 12 byte, tag 16 byte,
//!   tanpa AAD. Tag yang tidak cocok berarti payload palsu atau kunci salah.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const HKDF_INFO: &[u8] = b"sso-verify-v1";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

#[derive(Debug, PartialEq, Eq)]
pub enum CryptoError {
    /// Amplop bukan base64 / panjang nonce atau tag salah.
    Malformed,
    /// Tag GCM tidak cocok: kunci salah atau payload diubah.
    Authentication,
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Malformed => f.write_str("amplop SSO tidak berbentuk benar"),
            Self::Authentication => f.write_str("amplop SSO gagal diautentikasi"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub nonce: String,
    pub ciphertext: String,
    pub tag: String,
}

/// Penyimpan kunci turunan. Tidak mengimplementasikan `Debug` agar kunci tidak masuk log.
pub struct EnvelopeKey {
    cipher: Aes256Gcm,
}

impl EnvelopeKey {
    #[must_use]
    pub fn from_app_token(app_token: &str) -> Self {
        let prk = Sha256::digest(app_token.as_bytes());
        // `from_prk` hanya gagal bila PRK lebih pendek dari hash; SHA-256 selalu 32 byte.
        let hk = Hkdf::<Sha256>::from_prk(&prk).expect("PRK 32 byte");
        let mut okm = [0u8; 32];
        hk.expand(HKDF_INFO, &mut okm).expect("32 byte <= 255 * hash len");
        Self { cipher: Aes256Gcm::new_from_slice(&okm).expect("kunci 32 byte") }
    }

    /// # Errors
    /// `Authentication` bila enkripsi gagal (praktis tidak terjadi).
    pub fn seal(&self, plaintext: &[u8]) -> Result<Envelope, CryptoError> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let mut sealed = self.cipher.encrypt(&nonce, plaintext).map_err(|_| CryptoError::Authentication)?;
        // aes-gcm menempelkan tag di ujung ciphertext; kontrak Portal memisahkannya.
        let tag = sealed.split_off(sealed.len() - TAG_LEN);
        Ok(Envelope {
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(sealed),
            tag: STANDARD.encode(tag),
        })
    }

    /// # Errors
    /// `Malformed` untuk bentuk salah, `Authentication` untuk tag/kunci salah.
    pub fn open(&self, envelope: &Envelope) -> Result<Vec<u8>, CryptoError> {
        let nonce = STANDARD.decode(&envelope.nonce).map_err(|_| CryptoError::Malformed)?;
        let mut data = STANDARD.decode(&envelope.ciphertext).map_err(|_| CryptoError::Malformed)?;
        let tag = STANDARD.decode(&envelope.tag).map_err(|_| CryptoError::Malformed)?;
        if nonce.len() != NONCE_LEN || tag.len() != TAG_LEN {
            return Err(CryptoError::Malformed);
        }
        data.extend_from_slice(&tag);
        let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| CryptoError::Malformed)?;
        self.cipher
            .decrypt(&Nonce::from(nonce), data.as_slice())
            .map_err(|_| CryptoError::Authentication)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "token-aplikasi-uji-0123456789-abcdefghijklmnop";

    #[test]
    fn roundtrip() {
        let key = EnvelopeKey::from_app_token(TOKEN);
        let env = key.seal(br#"{"code":"abc"}"#).unwrap();
        assert_eq!(key.open(&env).unwrap(), br#"{"code":"abc"}"#);
        assert_eq!(STANDARD.decode(&env.nonce).unwrap().len(), 12);
        assert_eq!(STANDARD.decode(&env.tag).unwrap().len(), 16);
    }

    #[test]
    fn nonce_is_fresh_per_message() {
        let key = EnvelopeKey::from_app_token(TOKEN);
        let a = key.seal(b"x").unwrap();
        let b = key.seal(b"x").unwrap();
        assert_ne!(a.nonce, b.nonce);
        assert_ne!(a.ciphertext, b.ciphertext);
    }

    #[test]
    fn wrong_key_is_rejected() {
        let env = EnvelopeKey::from_app_token(TOKEN).seal(b"rahasia").unwrap();
        let other = EnvelopeKey::from_app_token("token-lain-0123456789-abcdefghijklmnopqrs");
        assert_eq!(other.open(&env), Err(CryptoError::Authentication));
    }

    #[test]
    fn tampering_is_rejected() {
        let key = EnvelopeKey::from_app_token(TOKEN);
        let env = key.seal(b"identitas").unwrap();

        let mut flipped = STANDARD.decode(&env.ciphertext).unwrap();
        flipped[0] ^= 0x01;
        let tampered_ct = Envelope { ciphertext: STANDARD.encode(flipped), ..env.clone() };
        assert_eq!(key.open(&tampered_ct), Err(CryptoError::Authentication));

        let mut bad_tag = STANDARD.decode(&env.tag).unwrap();
        bad_tag[0] ^= 0x01;
        let tampered_tag = Envelope { tag: STANDARD.encode(bad_tag), ..env };
        assert_eq!(key.open(&tampered_tag), Err(CryptoError::Authentication));
    }

    #[test]
    fn malformed_envelopes_are_rejected() {
        let key = EnvelopeKey::from_app_token(TOKEN);
        let env = key.seal(b"x").unwrap();
        assert_eq!(key.open(&Envelope { nonce: "!!!".into(), ..env.clone() }), Err(CryptoError::Malformed));
        assert_eq!(
            key.open(&Envelope { nonce: STANDARD.encode([0u8; 8]), ..env.clone() }),
            Err(CryptoError::Malformed)
        );
        assert_eq!(key.open(&Envelope { tag: STANDARD.encode([0u8; 4]), ..env }), Err(CryptoError::Malformed));
    }

    /// Vektor dari implementasi independen (`scripts/sso-envelope.mjs`, HMAC manual untuk
    /// HKDF-Expand), nonce tetap. Memastikan pustaka `hkdf` menghasilkan kunci yang sama dengan rumus kontrak.
    #[test]
    fn opens_envelope_sealed_by_independent_node_implementation() {
        let env = Envelope {
            nonce: "BwcHBwcHBwcHBwcH".to_string(),
            ciphertext: "+q9wUp+oH2p02bRg9yw=".to_string(),
            tag: "/D0PGIUzB2STE1M7Jw243w==".to_string(),
        };
        let plain = EnvelopeKey::from_app_token(TOKEN).open(&env).unwrap();
        assert_eq!(plain, br#"{"code":"abc"}"#);
    }

    /// Kunci diturunkan deterministik dari token; dua instans harus saling membuka.
    #[test]
    fn key_derivation_is_deterministic() {
        let env = EnvelopeKey::from_app_token(TOKEN).seal(b"sama").unwrap();
        assert_eq!(EnvelopeKey::from_app_token(TOKEN).open(&env).unwrap(), b"sama");
    }
}
