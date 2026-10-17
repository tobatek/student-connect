//! Deteksi tipe file dari isi (magic bytes), bukan dari ekstensi atau header klien (A.8.26).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Pdf,
    Jpeg,
    Png,
}

impl FileKind {
    #[must_use]
    pub const fn mime(self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Jpeg => "image/jpeg",
            Self::Png => "image/png",
        }
    }

    #[must_use]
    pub const fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Jpeg => "jpg",
            Self::Png => "png",
        }
    }
}

#[must_use]
pub fn detect(bytes: &[u8]) -> Option<FileKind> {
    if bytes.starts_with(b"%PDF-") {
        Some(FileKind::Pdf)
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(FileKind::Jpeg)
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some(FileKind::Png)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_by_content() {
        assert_eq!(detect(b"%PDF-1.7 ..."), Some(FileKind::Pdf));
        assert_eq!(detect(&[0xFF, 0xD8, 0xFF, 0xE0]), Some(FileKind::Jpeg));
        assert_eq!(
            detect(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0]),
            Some(FileKind::Png)
        );
    }

    #[test]
    fn rejects_executables_and_scripts() {
        assert_eq!(detect(b"MZ\x90\x00"), None);
        assert_eq!(detect(b"<script>alert(1)</script>"), None);
        assert_eq!(detect(b""), None);
    }
}
