//! Unggah dokumen bukti ke storage (R2) lewat backend. Kunci R2 tidak pernah sampai ke browser.
//!
//! Kontrol: allowlist tipe dari ISI file, batas ukuran, nama objek berkomponen UUID acak,
//! tanpa overwrite, checksum SHA-256, kunci dokumen setelah terkirim (A.8.12, A.8.26).

use std::{collections::HashMap, time::Duration};

use axum::extract::DefaultBodyLimit;
use bytes::Bytes;
use loco_rs::prelude::*;
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};

use super::support::{audit, created, map_model};
use crate::{
    errors::{bad_gateway, conflict, too_large, too_many_requests, FieldErrors},
    models::{
        audit_logs::Outcome,
        documents::{self, display_filename, safe_filename, DOCUMENT_TYPES, RECORD_TYPES},
        records::{self, Kind},
        tenants,
    },
    security::{principal::Principal, rate_limit, roles::Perm, sniff},
    settings::Settings,
    views::{DocumentView, Page, PageQuery},
};

/// Batas keras body untuk rute unggah; batas efektif per-konfigurasi diperiksa di handler.
const HARD_BODY_LIMIT: usize = 17 * 1024 * 1024;

#[derive(Debug, Deserialize)]
struct ListParams {
    #[serde(flatten)]
    page: PageQuery,
    record_type: Option<String>,
    record_ref: Option<String>,
}

fn record_kind(record_type: &str) -> Option<Kind> {
    match record_type {
        "prestasi-mandiri" => Some(Kind::PrestasiMandiri),
        "sertifikasi" => Some(Kind::Sertifikasi),
        "rekognisi" => Some(Kind::Rekognisi),
        _ => None,
    }
}

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::with_capacity(bytes.len() * 2), |mut acc, b| {
        let _ = write!(acc, "{b:02x}");
        acc
    })
}

#[debug_handler]
async fn list(State(ctx): State<AppContext>, p: Principal, Query(q): Query<ListParams>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let (page, size) = q.page.normalized();
    let uploader = p.role.sees_only_own().then_some(p.user.id);
    let (rows, total) = documents::Model::list(&ctx.db, p.tenant_id(), q.record_type.as_deref(), q.record_ref.as_deref(), uploader, page, size)
        .await
        .map_err(map_model)?;
    format::json(Page::new(rows.iter().map(DocumentView::from).collect(), page, size, total))
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let doc = documents::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    if p.role.sees_only_own() && doc.uploaded_by != Some(p.user.id) {
        return Err(Error::NotFound);
    }
    format::json(DocumentView::from(&doc))
}

#[debug_handler]
async fn upload(State(ctx): State<AppContext>, p: Principal, mut multipart: Multipart) -> Result<Response> {
    p.require(Perm::DocumentUpload)?;
    if !rate_limit::allow(&format!("upload:{}", p.user.id), 30, Duration::from_secs(60)) {
        return too_many_requests("Terlalu banyak unggahan. Coba lagi sebentar lagi.");
    }
    let settings = Settings::get(&ctx)?;
    let max_bytes = usize::try_from(settings.storage.max_upload_mb * 1024 * 1024).unwrap_or(usize::MAX);

    let mut fields: HashMap<String, String> = HashMap::new();
    let mut file: Option<(String, Vec<u8>)> = None;
    while let Some(mut field) = multipart.next_field().await.map_err(|_| Error::BadRequest("Form unggah tidak valid.".into()))? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("dokumen").to_string();
            let mut buf: Vec<u8> = Vec::new();
            while let Some(chunk) = field.chunk().await.map_err(|_| Error::BadRequest("Unggahan terputus.".into()))? {
                if buf.len() + chunk.len() > max_bytes {
                    return too_large(&format!("Ukuran file maksimal {} MB.", settings.storage.max_upload_mb));
                }
                buf.extend_from_slice(&chunk);
            }
            file = Some((filename, buf));
        } else if ["record_type", "record_ref", "document_type", "tahun"].contains(&name.as_str()) {
            let text = field.text().await.map_err(|_| Error::BadRequest("Form unggah tidak valid.".into()))?;
            if text.len() > 128 {
                return Err(Error::BadRequest("Nilai field terlalu panjang.".into()));
            }
            fields.insert(name, text);
        }
    }

    let mut errors = FieldErrors::default();
    let record_type = fields.get("record_type").map_or("", String::as_str);
    let document_type = fields.get("document_type").map_or("", String::as_str);
    let record_ref = fields.get("record_ref").map_or("", String::as_str);
    if !RECORD_TYPES.contains(&record_type) {
        errors.add("record_type", "Jenis record tidak valid.");
    }
    if !DOCUMENT_TYPES.contains(&document_type) {
        errors.add("document_type", "Jenis dokumen tidak valid.");
    }
    let ref_re = Regex::new(r"^[A-Za-z0-9-]{1,64}$").map_err(|_| Error::InternalServerError)?;
    if !ref_re.is_match(record_ref) {
        errors.add("record_ref", "Referensi record tidak valid.");
    }
    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    let tahun = match fields.get("tahun") {
        Some(t) => t.parse::<i32>().ok().filter(|y| (2000..=2100).contains(y)),
        None => Some(tenant.tahun_aktif),
    };
    if tahun.is_none() {
        errors.add("tahun", "Tahun tidak valid.");
    }
    let Some((original_name, bytes)) = file else {
        errors.add("file", "File wajib diunggah.");
        return Err(errors.into_error());
    };
    if bytes.is_empty() {
        errors.add("file", "File kosong.");
    }
    let kind = sniff::detect(&bytes);
    if kind.is_none() {
        errors.add("file", "Hanya PDF, JPG, atau PNG yang diizinkan (dicek dari isi file).");
    }
    if !errors.is_empty() {
        return Err(errors.into_error());
    }
    let (Some(kind), Some(tahun)) = (kind, tahun) else {
        return Err(Error::InternalServerError);
    };

    // Record induk harus ada di tenant ini dan belum terkunci.
    if let Some(record_kind) = record_kind(record_type) {
        let Ok(record_pid) = Uuid::parse_str(record_ref) else {
            return Err(Error::NotFound);
        };
        let owner = p.role.sees_only_own().then_some(p.user.id);
        match records::Model::find_scoped(&ctx.db, p.tenant_id(), record_kind, owner, record_pid).await {
            Ok(record) => {
                if [records::status::QUEUED, records::status::SENDING, records::status::SENT].contains(&record.status.as_str()) {
                    return conflict("Record sudah diproses/terkirim; dokumen tidak dapat ditambahkan.");
                }
            }
            // Draf baru yang belum disimpan: formulir membuat UUID lebih dulu (client_ref) supaya unggahan
            // langsung mengisi tautan. Ditolak bila UUID itu sudah milik record lain (anti-IDOR).
            Err(ModelError::EntityNotFound) if !records::Model::pid_taken(&ctx.db, record_pid).await.map_err(map_model)? => {}
            Err(e) => return Err(map_model(e)),
        }
    }

    let safe = safe_filename(&original_name);
    let stem = safe.rsplit_once('.').map_or(safe.as_str(), |(s, _)| s);
    let key = format!(
        "tenants/{}/simkatmawa/{tahun}/{record_type}/{record_ref}/{document_type}/{}-{}.{}",
        tenant.slug,
        Uuid::new_v4(),
        if stem.is_empty() { "dokumen" } else { stem },
        kind.extension()
    );
    let checksum = hex(&Sha256::digest(&bytes));
    let size = i64::try_from(bytes.len()).unwrap_or(i64::MAX);

    ctx.storage
        .upload(std::path::Path::new(&key), &Bytes::from(bytes))
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "upload storage gagal");
            Error::InternalServerError
        })?;

    let public_url = format!("{}/{key}", settings.storage.public_base_url.trim_end_matches('/'));
    let inserted = documents::ActiveModel {
        pid: ActiveValue::set(Uuid::new_v4()),
        tenant_id: ActiveValue::set(p.tenant_id()),
        record_type: ActiveValue::set(record_type.to_string()),
        record_ref: ActiveValue::set(record_ref.to_string()),
        document_type: ActiveValue::set(document_type.to_string()),
        tahun: ActiveValue::set(tahun),
        original_filename: ActiveValue::set(display_filename(&original_name)),
        storage_key: ActiveValue::set(key.clone()),
        public_url: ActiveValue::set(public_url),
        mime_type: ActiveValue::set(kind.mime().to_string()),
        size_bytes: ActiveValue::set(size),
        checksum_sha256: ActiveValue::set(checksum),
        is_locked: ActiveValue::set(false),
        uploaded_by: ActiveValue::set(Some(p.user.id)),
        ..Default::default()
    }
    .insert(&ctx.db)
    .await;
    let doc = match inserted {
        Ok(doc) => doc,
        Err(err) => {
            // Jangan tinggalkan objek yatim di storage.
            let _ = ctx.storage.delete(std::path::Path::new(&key)).await;
            return Err(err.into());
        }
    };
    audit(&ctx, &p, "document.upload", "document", Some(doc.pid.to_string()), Outcome::Success, json!({"record_type": record_type, "bytes": size, "mime": doc.mime_type})).await?;
    created(&DocumentView::from(&doc))
}

#[debug_handler]
async fn remove(State(ctx): State<AppContext>, p: Principal, Path(id): Path<Uuid>) -> Result<Response> {
    let doc = documents::Model::find_in_tenant(&ctx.db, p.tenant_id(), id).await.map_err(map_model)?;
    if !(p.can(Perm::DocumentDelete) || doc.uploaded_by == Some(p.user.id)) {
        p.require(Perm::DocumentDelete)?;
    }
    if doc.is_locked {
        return conflict("Dokumen sudah terkirim ke SIMKATMAWA dan terkunci permanen.");
    }
    if ctx.storage.delete(std::path::Path::new(&doc.storage_key)).await.is_err() {
        return bad_gateway("Gagal menghapus objek di storage. Coba lagi.");
    }
    documents::Entity::delete_by_id(doc.id).exec(&ctx.db).await?;
    audit(&ctx, &p, "document.delete", "document", Some(doc.pid.to_string()), Outcome::Success, json!({})).await?;
    format::empty_json()
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/documents")
        .add("/", get(list))
        .add("/", post(upload).layer(DefaultBodyLimit::max(HARD_BODY_LIMIT)))
        .add("/{id}", get(show))
        .add("/{id}", delete(remove))
}
