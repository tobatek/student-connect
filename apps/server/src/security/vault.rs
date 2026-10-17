//! Brankas kredensial: AES-256-GCM dengan nonce acak per enkripsi dan AAD terikat tenant.
//! Kredensial eksternal harus dapat dipakai ulang, sehingga dienkripsi (bukan di-hash) — A.8.24.

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, Payload},
    AeadCore, Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};

const VERSION: &str = "v1";

pub struct Vault {
    cipher: Aes256Gcm,
}

#[derive(Debug, PartialEq, Eq)]
pub enum VaultError {
    BadKey,
    BadCiphertext,
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadKey => f.write_str("kunci harus base64 dari tepat 32 byte"),
            Self::BadCiphertext => f.write_str("data terenkripsi tidak valid atau telah diubah"),
        }
    }
}

impl Vault {
    /// # Errors
    /// `BadKey` bila bukan base64 32 byte.
    pub fn from_base64(key_b64: &str) -> Result<Self, VaultError> {
        let bytes = STANDARD
            .decode(key_b64.trim())
            .map_err(|_| VaultError::BadKey)?;
        if bytes.len() != 32 {
            return Err(VaultError::BadKey);
        }
        Ok(Self {
            cipher: Aes256Gcm::new_from_slice(&bytes).map_err(|_| VaultError::BadKey)?,
        })
    }

    /// `aad` mengikat ciphertext ke konteks (mis. `tenant:42:password`) sehingga
    /// baris yang dipindah ke tenant lain gagal didekripsi.
    ///
    /// # Errors
    /// `BadCiphertext` bila enkripsi gagal.
    pub fn seal(&self, plaintext: &str, aad: &str) -> Result<String, VaultError> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = self
            .cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| VaultError::BadCiphertext)?;
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&ct);
        Ok(format!("{VERSION}:{}", STANDARD.encode(blob)))
    }

    /// # Errors
    /// `BadCiphertext` bila format salah, kunci salah, AAD berbeda, atau data diubah.
    pub fn open(&self, sealed: &str, aad: &str) -> Result<String, VaultError> {
        let body = sealed
            .strip_prefix(&format!("{VERSION}:"))
            .ok_or(VaultError::BadCiphertext)?;
        let blob = STANDARD
            .decode(body)
            .map_err(|_| VaultError::BadCiphertext)?;
        if blob.len() < 12 + 16 {
            return Err(VaultError::BadCiphertext);
        }
        let (nonce, ct) = blob.split_at(12);
        let nonce: [u8; 12] = nonce.try_into().map_err(|_| VaultError::BadCiphertext)?;
        let pt = self
            .cipher
            .decrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: ct,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| VaultError::BadCiphertext)?;
        String::from_utf8(pt).map_err(|_| VaultError::BadCiphertext)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> Vault {
        Vault::from_base64(&STANDARD.encode([7u8; 32])).unwrap()
    }

    #[test]
    fn roundtrip() {
        let v = vault();
        let sealed = v.seal("rahasia", "tenant:1:password").unwrap();
        assert!(!sealed.contains("rahasia"));
        assert_eq!(v.open(&sealed, "tenant:1:password").unwrap(), "rahasia");
    }

    #[test]
    fn nonce_is_random() {
        let v = vault();
        assert_ne!(v.seal("x", "a").unwrap(), v.seal("x", "a").unwrap());
    }

    #[test]
    fn aad_and_tamper_are_rejected() {
        let v = vault();
        let sealed = v.seal("rahasia", "tenant:1:password").unwrap();
        assert!(v.open(&sealed, "tenant:2:password").is_err());
        let mut tampered = sealed.clone();
        tampered.push('A');
        assert!(v.open(&tampered, "tenant:1:password").is_err());
    }

    #[test]
    fn rejects_bad_keys() {
        assert!(Vault::from_base64("bukan-base64!!").is_err());
        assert!(Vault::from_base64(&STANDARD.encode([1u8; 16])).is_err());
    }
}
