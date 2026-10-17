//! Pembantu bersama untuk controller: audit, pemetaan galat model, respons.

use axum::http::{header, HeaderValue, StatusCode};
use loco_rs::prelude::*;
use serde::Serialize;
use serde_json::Value;

use crate::{
    errors::conflict,
    models::audit_logs::{self, Entry, Outcome},
    security::principal::Principal,
};

/// Mengubah `ModelError::Message("conflict:...")` menjadi 409; lainnya mengikuti pemetaan Loco.
pub fn map_model(err: ModelError) -> Error {
    match err {
        ModelError::Message(ref m) if m.starts_with("conflict:") => {
            conflict::<()>(m.trim_start_matches("conflict:")).err().unwrap_or(Error::InternalServerError)
        }
        other => Error::Model(other),
    }
}

/// Tulis audit untuk aksi pengguna terautentikasi. Gagal-tertutup: galat dipropagasikan.
pub async fn audit(
    ctx: &AppContext,
    p: &Principal,
    action: &str,
    entity: &str,
    entity_ref: Option<String>,
    outcome: Outcome,
    detail: Value,
) -> Result<()> {
    audit_logs::Model::record(
        &ctx.db,
        Entry {
            tenant_id: Some(p.tenant_id()),
            actor: Some(p.actor()),
            action,
            entity,
            entity_ref,
            outcome,
            ip: p.meta.ip.clone(),
            request_id: p.meta.request_id.clone(),
            detail,
        },
    )
    .await
    .map_err(Error::Model)?;
    Ok(())
}

/// 201 Created dengan body JSON.
pub fn created<T: Serialize>(body: &T) -> Result<Response> {
    format::render().status(StatusCode::CREATED).json(body)
}

/// Respons berkas unduhan (mis. CSV) dengan header aman.
pub fn download(content_type: &'static str, filename: &str, body: String) -> Result<Response> {
    let mut resp = Response::new(axum::body::Body::from(body));
    let headers = resp.headers_mut();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    let disposition = format!("attachment; filename=\"{}\"", filename.replace(['"', '\\', '\r', '\n'], "_"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).map_err(|_| Error::InternalServerError)?,
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(resp)
}

/// Identitas mahasiswa untuk pengisian otomatis formulir. NIM berasal dari Portal; nama diambil
/// dari data master (kanonik) bila ada, jika tidak dari nama akun.
pub async fn student_identity(
    ctx: &AppContext,
    user: &crate::models::users::Model,
) -> Result<Option<crate::views::StudentView>> {
    if user.role != "MAHASISWA" {
        return Ok(None);
    }
    let Some(nim) = user.nim.clone() else {
        return Ok(None);
    };
    let nama = match crate::models::master_data::student_by_nim(&ctx.db, user.tenant_id, &nim).await? {
        Some(s) => s.full_name,
        None => user.name.clone(),
    };
    Ok(Some(crate::views::StudentView { nim, nama }))
}
