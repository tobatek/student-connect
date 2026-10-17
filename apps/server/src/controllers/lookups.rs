//! Pencarian data master (hasil sinkronisasi Portal) untuk pilihan di formulir:
//! mahasiswa (NIM + nama) dan dosen pembimbing (NUPTK + nama). Tidak ada isian bebas.

use std::time::Duration;

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use crate::{
    errors::{too_many_requests, FieldErrors},
    models::master_data,
    security::{principal::Principal, rate_limit, roles::Perm},
};

const LIMIT: u64 = 20;

#[derive(Debug, Deserialize)]
struct LookupQuery {
    q: Option<String>,
}

fn clean_query(q: Option<String>) -> Result<String> {
    let q = q.unwrap_or_default().trim().to_string();
    let mut errors = FieldErrors::default();
    if q.chars().count() > 60 || q.chars().any(char::is_control) {
        errors.add("q", "Kata kunci maksimal 60 karakter.");
    }
    errors.into_result()?;
    Ok(q)
}

fn throttle(p: &Principal) -> Result<()> {
    if rate_limit::allow(&format!("lookup:{}", p.user.id), 120, Duration::from_secs(60)) {
        Ok(())
    } else {
        too_many_requests("Terlalu banyak pencarian. Coba lagi sebentar lagi.")
    }
}

#[debug_handler]
async fn students(State(ctx): State<AppContext>, p: Principal, Query(query): Query<LookupQuery>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    throttle(&p)?;
    let q = clean_query(query.q)?;
    // Daftar mahasiswa tidak ditampilkan utuh: minimal 2 karakter kata kunci.
    if q.chars().count() < 2 {
        return format::render().header("cache-control", "no-store").json(json!([]));
    }
    let rows = master_data::search_students(&ctx.db, p.tenant_id(), &q, LIMIT).await?;
    let out: Vec<_> = rows
        .iter()
        .map(|s| json!({"nim": s.nim, "nama": s.full_name, "prodi": s.study_program, "angkatan": s.cohort_year}))
        .collect();
    format::render().header("cache-control", "no-store").json(out)
}

#[debug_handler]
async fn lecturers(State(ctx): State<AppContext>, p: Principal, Query(query): Query<LookupQuery>) -> Result<Response> {
    p.require(Perm::RecordWrite)?;
    throttle(&p)?;
    let q = clean_query(query.q)?;
    let rows = master_data::search_lecturers(&ctx.db, p.tenant_id(), &q, LIMIT).await?;
    let out: Vec<_> = rows
        .iter()
        .filter_map(|e| e.nuptk.as_ref().map(|nuptk| json!({"nuptk": nuptk, "nama": e.full_name, "unit": e.work_unit})))
        .collect();
    format::render().header("cache-control", "no-store").json(out)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/lookups")
        .add("/mahasiswa", get(students))
        .add("/dosen", get(lecturers))
}
