//! Kebijakan kata sandi (A.5.17, A.8.5): panjang minimum 12, empat kelas karakter,
//! tidak memuat bagian email, dan bukan kata sandi umum.

const COMMON: &[&str] = &[
    "password1234",
    "passw0rd1234",
    "qwerty123456",
    "123456789012",
    "admin1234567",
    "welcome12345",
    "kemahasiswaan",
    "studentconnect",
];

/// # Errors
/// Mengembalikan pesan alasan penolakan (aman ditampilkan ke pengguna).
pub fn validate(password: &str, email: &str) -> Result<(), &'static str> {
    if password.chars().count() < 12 {
        return Err("Kata sandi minimal 12 karakter.");
    }
    if password.len() > 128 {
        return Err("Kata sandi maksimal 128 karakter.");
    }
    let has = |f: fn(char) -> bool| password.chars().any(f);
    if !(has(|c| c.is_ascii_lowercase())
        && has(|c| c.is_ascii_uppercase())
        && has(|c| c.is_ascii_digit())
        && has(|c| !c.is_alphanumeric()))
    {
        return Err("Gunakan huruf besar, huruf kecil, angka, dan simbol.");
    }
    let lower = password.to_lowercase();
    let local = email.split('@').next().unwrap_or("").to_lowercase();
    if local.len() >= 4 && lower.contains(&local) {
        return Err("Kata sandi tidak boleh memuat bagian dari email.");
    }
    if COMMON.iter().any(|c| lower.contains(c)) {
        return Err("Kata sandi terlalu umum.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate;

    #[test]
    fn accepts_strong() {
        assert!(validate("Tr0ub4dor&Horse!", "budi@kampus.ac.id").is_ok());
    }

    #[test]
    fn rejects_weak() {
        assert!(validate("short1A!", "a@b.id").is_err());
        assert!(validate("alllowercaseletters", "a@b.id").is_err());
        assert!(validate("Budisantoso12345!", "budisantoso@kampus.ac.id").is_err());
        assert!(validate("Password1234!!", "x@y.id").is_err());
    }
}
