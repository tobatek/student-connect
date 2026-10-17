//! Metadata dokumen bukti. Byte file ada di storage (R2); kunci objek dibuat backend
//! dengan komponen UUID acak sehingga tidak dapat ditebak, dan tidak pernah menimpa objek lama.

use loco_rs::prelude::*;
use sea_orm::sea_query::Expr;

pub use super::_entities::documents::{self, ActiveModel, Column, Entity, Model};

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {}

pub const RECORD_TYPES: [&str; 6] = [
    "prestasi-mandiri",
    "sertifikasi",
    "rekognisi",
    "kejuaraan",
    "institusi",
    "umum",
];
pub const DOCUMENT_TYPES: [&str; 8] = [
    "sertifikat",
    "peserta",
    "foto-upp",
    "undangan",
    "surat-tugas",
    "laporan",
    "bukti",
    "lainnya",
];

/// Menjadikan nama file aman sebagai akhiran kunci objek (A.8.26, anti path traversal).
#[must_use]
pub fn safe_filename(original: &str) -> String {
    let base = original.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim_matches(|c| c == '.' || c == '-');
    let cleaned: String = cleaned.chars().take(80).collect();
    if cleaned.is_empty() { "dokumen".to_string() } else { cleaned }
}

/// Nama tampilan: buang kontrol dan pemisah path, batasi panjang.
#[must_use]
pub fn display_filename(original: &str) -> String {
    let base = original.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = base.chars().filter(|c| !c.is_control()).take(200).collect();
    if cleaned.trim().is_empty() { "dokumen".to_string() } else { cleaned }
}

impl Model {
    /// # Errors
    /// Galat database.
    pub async fn list(
        db: &DatabaseConnection,
        tenant_id: i64,
        record_type: Option<&str>,
        record_ref: Option<&str>,
        uploader: Option<i64>,
        page: u64,
        page_size: u64,
    ) -> ModelResult<(Vec<Self>, u64)> {
        let mut q = Entity::find().filter(Column::TenantId.eq(tenant_id));
        if let Some(t) = record_type {
            q = q.filter(Column::RecordType.eq(t));
        }
        if let Some(r) = record_ref {
            q = q.filter(Column::RecordRef.eq(r));
        }
        if let Some(u) = uploader {
            q = q.filter(Column::UploadedBy.eq(u));
        }
        let paginator = q.order_by_desc(Column::CreatedAt).paginate(db, page_size);
        let total = paginator.num_items().await?;
        let items = paginator.fetch_page(page.saturating_sub(1)).await?;
        Ok((items, total))
    }

    /// # Errors
    /// `EntityNotFound` bila bukan milik tenant.
    pub async fn find_in_tenant(db: &DatabaseConnection, tenant_id: i64, pid: Uuid) -> ModelResult<Self> {
        Entity::find()
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::Pid.eq(pid))
            .one(db)
            .await?
            .ok_or(ModelError::EntityNotFound)
    }

    /// Mengunci semua dokumen yang tautannya dipakai record (setelah terkirim ke SIMKATMAWA).
    ///
    /// # Errors
    /// Galat database.
    pub async fn lock_for_record(db: &DatabaseConnection, tenant_id: i64, record_ref: &str) -> ModelResult<u64> {
        let res = Entity::update_many()
            .col_expr(Column::IsLocked, Expr::value(true))
            .filter(Column::TenantId.eq(tenant_id))
            .filter(Column::RecordRef.eq(record_ref))
            .exec(db)
            .await?;
        Ok(res.rows_affected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filenames_cannot_escape() {
        assert_eq!(safe_filename("../../etc/passwd"), "passwd");
        assert_eq!(safe_filename("..\\..\\boot.ini"), "boot.ini");
        assert_eq!(safe_filename("sertifikat final (1).pdf"), "sertifikat-final--1-.pdf");
        assert_eq!(safe_filename("...."), "dokumen");
        assert!(!safe_filename("a\0b.pdf").contains('\0'));
        assert!(safe_filename(&"x".repeat(500)).len() <= 80);
    }

    #[test]
    fn display_name_strips_controls() {
        assert_eq!(display_filename("C:\\fakepath\\a\nb.pdf"), "ab.pdf");
    }
}
