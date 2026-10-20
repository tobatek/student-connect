//! Prestasi mandiri, sertifikasi, rekognisi: CRUD, alur verifikasi, dan antrean pengiriman.
//!
//! Semua query dibatasi `tenant_id` (anti-IDOR). Peran MAHASISWA hanya melihat/mengubah miliknya.

use std::time::Duration;

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use super::support::{audit, created, download, map_model, student_identity};
use crate::{
    errors::{conflict, too_many_requests, FieldErrors},
    models::{
        audit_logs::Outcome,
        master_data,
        records::{self, status, Kind, ListQuery, RecordInput},
        simkatmawa_credentials, tenants,
    },
    security::{csv, principal::Principal, rate_limit, roles::{Perm, Role}},
    settings::Settings,
    views::{Page, PageQuery, RecordView},
    workers::submit_simkatmawa::{SubmitSimkatmawaWorker, SubmitSimkatmawaWorkerArgs},
};

fn kind_from_slug(slug: &str) -> Result<Kind> {
    match slug {
        "prestasi-mandiri" => Ok(Kind::PrestasiMandiri),
        "sertifikasi" => Ok(Kind::Sertifikasi),
        "rekognisi" => Ok(Kind::Rekognisi),
        _ => Err(Error::NotFound),
    }
}

fn owner_scope(p: &Principal) -> Option<i64> {
    p.role.sees_only_own().then_some(p.user.id)
}

/// Menyamakan mahasiswa dan dosen pada record dengan data Portal (sumber kebenaran tunggal).
///
/// * Akun MAHASISWA: dirinya selalu tercantum di urutan pertama dengan NIM dan nama dari Portal,
///   apa pun yang dikirim klien (pengisian otomatis yang tidak bisa dipalsukan).
/// * Bila sinkronisasi master aktif: setiap NIM/NUPTK harus ada di data Portal dan namanya
///   diganti dengan nama kanonik, sehingga tidak ada isian bebas.
async fn enforce_people(ctx: &AppContext, p: &Principal, v: &mut records::Validated) -> Result<()> {
    let settings = Settings::get(ctx)?;
    let master_on = settings.sso.enabled && settings.master_sync.enabled;
    let mut errors = FieldErrors::default();
    let mut students: Vec<serde_json::Value> = v.mahasiswa.as_array().cloned().unwrap_or_default();

    if p.role == Role::Mahasiswa {
        let Some(me) = student_identity(ctx, &p.user).await? else {
            return conflict("NIM akun Anda belum tersedia dari Portal. Keluar lalu masuk lagi lewat Portal, atau hubungi admin.");
        };
        records::put_own_first(&mut students, &me.nim, &me.nama);
    }
    if students.len() > 50 {
        errors.add("mahasiswa", "Maksimal 50 mahasiswa.");
    }
    if master_on {
        for (i, s) in students.iter_mut().enumerate() {
            let nim = s["nim"].as_str().unwrap_or_default().to_string();
            match master_data::student_by_nim(&ctx.db, p.tenant_id(), &nim).await? {
                Some(m) => s["nama"] = serde_json::json!(m.full_name),
                None => errors.add(&format!("mahasiswa[{i}].nim"), "NIM tidak ditemukan di data Portal. Pilih dari daftar."),
            }
        }
    }
    if let Some(i) = records::first_duplicate(&students, "nim") {
        errors.add(&format!("mahasiswa[{i}].nim"), "Mahasiswa ini sudah dicantumkan.");
    }

    let mut lecturers: Vec<serde_json::Value> = v.dosen.as_array().cloned().unwrap_or_default();
    if master_on {
        for (i, d) in lecturers.iter_mut().enumerate() {
            let nuptk = d["nuptk"].as_str().unwrap_or_default().to_string();
            match master_data::lecturer_by_nuptk(&ctx.db, p.tenant_id(), &nuptk).await? {
                Some(m) => d["nama"] = serde_json::json!(m.full_name),
                None => errors.add(&format!("dosen[{i}].nuptk"), "Dosen tidak ditemukan di data Portal. Pilih dari daftar."),
            }
        }
    }
    if let Some(i) = records::first_duplicate(&lecturers, "nuptk") {
        errors.add(&format!("dosen[{i}].nuptk"), "Dosen ini sudah dicantumkan.");
    }
    errors.into_result()?;
    v.mahasiswa = serde_json::Value::Array(students);
    v.dosen = serde_json::Value::Array(lecturers);
    Ok(())
}

#[derive(Debug, Deserialize)]
struct ListParams {
    // Tanpa `#[serde(flatten)]`: dengan flatten, angka dari query string gagal di-parse.
    page: Option<u64>,
    page_size: Option<u64>,
    status: Option<String>,
    q: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RevisionParams {
    note: String,
}

#[debug_handler]
async fn list(State(ctx): State<AppContext>, p: Principal, Path(slug): Path<String>, Query(params): Query<ListParams>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let kind = kind_from_slug(&slug)?;
    let (page, size) = PageQuery { page: params.page, page_size: params.page_size }.normalized();
    let status_filter = params.status.as_deref().filter(|s| {
        [status::DRAFT, status::SUBMITTED_INTERNAL, status::NEED_REVISION, status::VERIFIED, status::QUEUED, status::SENDING, status::SENT, status::FAILED, status::CANCELLED].contains(s)
    });
    let (rows, total) = records::Model::list(
        &ctx.db,
        &ListQuery {
            tenant_id: p.tenant_id(),
            kind,
            owner: owner_scope(&p),
            status: status_filter,
            search: params.q.as_deref(),
            page,
            page_size: size,
        },
    )
    .await
    .map_err(map_model)?;
    format::json(Page::new(rows.iter().map(RecordView::from).collect(), page, size, total))
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let kind = kind_from_slug(&slug)?;
    let row = records::Model::find_scoped(&ctx.db, p.tenant_id(), kind, owner_scope(&p), id).await.map_err(map_model)?;
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn create(State(ctx): State<AppContext>, p: Principal, Path(slug): Path<String>, Json(input): Json<RecordInput>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    let kind = kind_from_slug(&slug)?;
    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    let client_ref = input.client_ref;
    let mut validated = match input.validate(kind, tenant.allow_kab_rekognisi) {
        Ok(v) => v,
        Err(e) => return Err(e.into_error()),
    };
    enforce_people(&ctx, &p, &mut validated).await?;
    let row = records::Model::create(&ctx.db, p.tenant_id(), kind, p.user.id, client_ref, validated).await.map_err(map_model)?;
    audit(&ctx, &p, "record.create", "record", Some(row.pid.to_string()), Outcome::Success, json!({"kind": kind.as_str()})).await?;
    created(&RecordView::from(&row))
}

#[debug_handler]
async fn update(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>, Json(input): Json<RecordInput>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    let kind = kind_from_slug(&slug)?;
    let Some(version) = input.version else {
        return crate::errors::validation(&std::iter::once(("version".to_string(), "Wajib menyertakan versi data.".to_string())).collect());
    };
    let tenant = tenants::Model::find_by_id(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    // Pemilik tidak boleh mengubah data yang sedang menunggu verifikasi admin (yang diverifikasi = yang dikirim).
    let current = records::Model::find_scoped(&ctx.db, p.tenant_id(), kind, owner_scope(&p), id).await.map_err(map_model)?;
    if current.status == status::SUBMITTED_INTERNAL && !p.can(Perm::RecordVerify) {
        return conflict("Data sedang menunggu verifikasi admin dan tidak dapat diubah.");
    }
    let mut validated = match input.validate(kind, tenant.allow_kab_rekognisi) {
        Ok(v) => v,
        Err(e) => return Err(e.into_error()),
    };
    enforce_people(&ctx, &p, &mut validated).await?;
    let row = records::Model::update_content(&ctx.db, p.tenant_id(), kind, owner_scope(&p), id, version, validated)
        .await
        .map_err(map_model)?;
    audit(&ctx, &p, "record.update", "record", Some(row.pid.to_string()), Outcome::Success, json!({"kind": kind.as_str(), "version": row.version})).await?;
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn remove(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    let kind = kind_from_slug(&slug)?;
    // Mahasiswa/dosen hanya boleh menghapus draf miliknya; hapus massal butuh izin khusus.
    let owner = if p.can(Perm::RecordDelete) { None } else { Some(p.user.id) };
    records::Model::remove(&ctx.db, p.tenant_id(), kind, owner, id).await.map_err(map_model)?;
    audit(&ctx, &p, "record.delete", "record", Some(id.to_string()), Outcome::Success, json!({"kind": kind.as_str()})).await?;
    format::empty_json()
}

async fn move_to(
    ctx: &AppContext,
    p: &Principal,
    slug: &str,
    id: Uuid,
    from: &[&str],
    to: &str,
    note: Option<String>,
    action: &str,
) -> Result<records::Model> {
    let kind = kind_from_slug(slug)?;
    let row = records::Model::transition(&ctx.db, p.tenant_id(), kind, owner_scope(p), id, from, to, note)
        .await
        .map_err(map_model)?;
    audit(ctx, p, action, "record", Some(row.pid.to_string()), Outcome::Success, json!({"kind": kind.as_str(), "to": to})).await?;
    Ok(row)
}

#[debug_handler]
async fn submit_internal(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    let row = move_to(&ctx, &p, &slug, id, &[status::DRAFT, status::NEED_REVISION], status::SUBMITTED_INTERNAL, None, "record.submit_internal").await?;
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn verify(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordVerify)?;
    let row = move_to(&ctx, &p, &slug, id, &[status::DRAFT, status::SUBMITTED_INTERNAL, status::NEED_REVISION], status::VERIFIED, None, "record.verify").await?;
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn request_revision(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>, Json(params): Json<RevisionParams>) -> Result<Response> {
    p.require(Perm::RecordVerify)?;
    let note = params.note.trim().to_string();
    if note.is_empty() || note.chars().count() > 500 {
        return crate::errors::validation(&std::iter::once(("note".to_string(), "Catatan revisi 1-500 karakter.".to_string())).collect());
    }
    let row = move_to(&ctx, &p, &slug, id, &[status::SUBMITTED_INTERNAL, status::VERIFIED], status::NEED_REVISION, Some(note), "record.request_revision").await?;
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn cancel(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordVerify)?;
    let row = move_to(&ctx, &p, &slug, id, &[status::DRAFT, status::SUBMITTED_INTERNAL, status::NEED_REVISION, status::VERIFIED, status::FAILED], status::CANCELLED, None, "record.cancel").await?;
    format::json(RecordView::from(&row))
}

/// Semua tautan yang akan dikirim harus publik: bukan localhost/jaringan internal, dan berkas yang
/// kita simpan sendiri benar-benar bisa dibuka tanpa login (bucket publik). Menyebut nama kolom saja,
/// tidak memantulkan isi tautan.
async fn ensure_links_public(ctx: &AppContext, row: &records::Model) -> Result<()> {
    let settings = Settings::get(ctx)?;
    let storage_base = settings.storage.public_base_url.trim_end_matches('/').to_string();

    let mut links: Vec<(String, String)> = vec![
        ("url_peserta".into(), row.url_peserta.clone()),
        ("url_sertifikat".into(), row.url_sertifikat.clone()),
    ];
    for (name, value) in [("url_foto_upp", &row.url_foto_upp), ("url_dokumen_undangan", &row.url_dokumen_undangan)] {
        if let Some(v) = value {
            links.push((name.into(), v.clone()));
        }
    }
    for (i, d) in row.dosen.as_array().into_iter().flatten().enumerate() {
        if let Some(u) = d.get("url_surat_tugas").and_then(serde_json::Value::as_str) {
            links.push((format!("dosen[{i}].url_surat_tugas"), u.to_string()));
        }
    }

    let mut not_public: Vec<String> = Vec::new();
    let mut unreachable: Vec<String> = Vec::new();
    for (name, url) in &links {
        if crate::security::url_guard::publicly_routable(url).is_err() {
            not_public.push(name.clone());
        } else if url.starts_with(&storage_base) && !crate::integrations::link_check::is_publicly_reachable(url).await {
            unreachable.push(name.clone());
        }
    }
    if !not_public.is_empty() {
        return conflict(&format!("Tautan bukan alamat publik: {}. SIMKATMAWA tidak bisa membukanya.", not_public.join(", ")));
    }
    if !unreachable.is_empty() {
        return conflict(&format!(
            "Berkas tidak bisa dibuka publik: {}. Periksa pengaturan akses publik bucket penyimpanan.",
            unreachable.join(", ")
        ));
    }
    Ok(())
}

/// Masukkan ke antrean pengiriman SIMKATMAWA. Worker memegang idempotensi; di sini kita
/// memastikan kredensial siap dan status sah (VERIFIED atau FAILED).
#[debug_handler]
async fn queue(State(ctx): State<AppContext>, p: Principal, Path((slug, id)): Path<(String, Uuid)>) -> Result<Response> {
    p.require(Perm::RecordSubmit)?;
    if !rate_limit::allow(&format!("queue:{}", p.user.id), 60, Duration::from_secs(60)) {
        return too_many_requests("Terlalu banyak permintaan kirim.");
    }
    let credentials = simkatmawa_credentials::Model::find_for_tenant(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    if !credentials.is_some_and(|c| c.is_connected) {
        return conflict("Hubungkan akun SIMKATMAWA terlebih dahulu di Pengaturan.");
    }
    let kind = kind_from_slug(&slug)?;
    let current = records::Model::find_scoped(&ctx.db, p.tenant_id(), kind, owner_scope(&p), id).await.map_err(map_model)?;
    // Hanya data yang sudah diverifikasi admin (atau gagal kirim) boleh dikirim; dicek lagi di transisi di bawah.
    if ![status::VERIFIED, status::FAILED].contains(&current.status.as_str()) {
        return conflict("Hanya data berstatus Terverifikasi atau Gagal yang dapat dikirim.");
    }
    ensure_links_public(&ctx, &current).await?;
    if records::Model::already_submitted(&ctx.db, &current).await.map_err(map_model)? {
        return conflict("Sertifikat yang sama untuk mahasiswa yang sama sudah dikirim atau sedang dalam antrean.");
    }
    let row = move_to(&ctx, &p, &slug, id, &[status::VERIFIED, status::FAILED], status::QUEUED, None, "record.queue").await?;
    if let Err(err) = SubmitSimkatmawaWorker::perform_later(&ctx, SubmitSimkatmawaWorkerArgs { record_id: row.id }).await {
        tracing::error!(error = %err, record = %row.pid, "gagal memasukkan job ke antrean");
        let failed = records::Model::mark_error(&ctx.db, row.id, "Gagal masuk antrean; coba kirim ulang.", false).await.map_err(map_model)?;
        return format::render().status(axum::http::StatusCode::SERVICE_UNAVAILABLE).json(RecordView::from(&failed));
    }
    format::json(RecordView::from(&row))
}

#[debug_handler]
async fn export(State(ctx): State<AppContext>, p: Principal, Path(slug): Path<String>) -> Result<Response> {
    p.require(Perm::Export)?;
    let kind = kind_from_slug(&slug)?;
    let (rows, _) = records::Model::list(
        &ctx.db,
        &ListQuery { tenant_id: p.tenant_id(), kind, owner: owner_scope(&p), status: None, search: None, page: 1, page_size: 5000 },
    )
    .await
    .map_err(map_model)?;
    let mut out = String::from("\u{feff}");
    out.push_str(&csv::row(&["ID", "Status", "Nama", "Level", "Penyelenggara", "Tanggal Sertifikat", "URL Sertifikat", "Mahasiswa", "ID SIMKATMAWA"]));
    out.push_str("\r\n");
    for r in &rows {
        let students = r
            .mahasiswa
            .as_array()
            .map(|a| a.iter().map(|m| format!("{} ({})", m["nama"].as_str().unwrap_or(""), m["nim"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("; "))
            .unwrap_or_default();
        let tgl = r.tgl_sertifikat.format("%Y-%m-%d").to_string();
        out.push_str(&csv::row(&[
            &r.pid.to_string(),
            &r.status,
            &r.nama,
            &r.level,
            &r.penyelenggara,
            &tgl,
            &r.url_sertifikat,
            &students,
            r.simkatmawa_id.as_deref().unwrap_or(""),
        ]));
        out.push_str("\r\n");
    }
    audit(&ctx, &p, "record.export", "record", None, Outcome::Success, json!({"kind": kind.as_str(), "rows": rows.len()})).await?;
    download("text/csv; charset=utf-8", &format!("{slug}.csv"), out)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/records/{kind}")
        .add("/", get(list))
        .add("/", post(create))
        .add("/export", get(export))
        .add("/{id}", get(show))
        .add("/{id}", put(update))
        .add("/{id}", delete(remove))
        .add("/{id}/submit-internal", post(submit_internal))
        .add("/{id}/verify", post(verify))
        .add("/{id}/request-revision", post(request_revision))
        .add("/{id}/cancel", post(cancel))
        .add("/{id}/queue", post(queue))
}

#[cfg(test)]
mod tests {
    use axum::extract::Query;

    use super::*;

    /// Regresi: dengan `#[serde(flatten)]` angka dari query string gagal di-parse dan rute membalas 400.
    #[test]
    fn list_params_parse_numeric_query() {
        let uri: axum::http::Uri = "/x?page=1&page_size=15&status=DRAFT&q=x".parse().unwrap();
        let Query(p) = Query::<ListParams>::try_from_uri(&uri).expect("query valid harus lolos");
        assert_eq!(PageQuery { page: p.page, page_size: p.page_size }.normalized(), (1, 15));
        assert_eq!(p.status.as_deref(), Some("DRAFT"));
        assert_eq!(p.q.as_deref(), Some("x"));
    }

    #[test]
    fn list_params_default_when_empty() {
        let uri: axum::http::Uri = "/x".parse().unwrap();
        let Query(p) = Query::<ListParams>::try_from_uri(&uri).unwrap();
        assert_eq!(PageQuery { page: p.page, page_size: p.page_size }.normalized(), (1, 20));
    }
}
