//! Cache baca-saja data master mahasiswa/pegawai dari Portal.
//!
//! Hanya identitas inti yang disimpan (NIM/NIP, nama, email, prodi/unit, status). Kolom lain di
//! respons Portal (NIK, tanggal lahir, nama ibu, dst.) sengaja diabaikan. Upsert berdasarkan
//! NIM/NIP; baris yang hilang dari sumber ditandai nonaktif, tidak dihapus.

use chrono::{DateTime, FixedOffset};
use loco_rs::prelude::*;
use sea_orm::sea_query::{extension::postgres::PgExpr, Expr, ExprTrait, Func};
use sea_orm::{ConnectionTrait, DbBackend, Statement};
use serde_json::Value;
use sha2::{Digest, Sha256};
use validator::ValidateEmail;

pub use super::_entities::{master_employees, master_students};

#[async_trait::async_trait]
impl ActiveModelBehavior for master_students::ActiveModel {}

#[async_trait::async_trait]
impl ActiveModelBehavior for master_employees::ActiveModel {}

/// Hasil normalisasi satu baris Portal, seragam untuk mahasiswa dan pegawai.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    /// NIM atau NIP.
    pub key: String,
    pub name: String,
    pub email: Option<String>,
    /// Prodi (mahasiswa) atau unit kerja (pegawai).
    pub unit: Option<String>,
    /// Angkatan (hanya mahasiswa).
    pub cohort_year: Option<i32>,
    /// Jabatan (hanya pegawai).
    pub position: Option<String>,
    /// NUPTK (hanya pegawai); wajib ada agar bisa dipilih sebagai dosen pembimbing.
    pub nuptk: Option<String>,
    pub is_active: bool,
    pub source_updated_at: Option<DateTime<FixedOffset>>,
}

impl Row {
    /// Sidik jari isi baris; berubah hanya bila ada kolom inti yang berubah.
    #[must_use]
    pub fn hash(&self) -> String {
        let canonical = [
            self.key.as_str(),
            self.name.as_str(),
            self.email.as_deref().unwrap_or(""),
            self.unit.as_deref().unwrap_or(""),
            &self.cohort_year.map(|y| y.to_string()).unwrap_or_default(),
            self.position.as_deref().unwrap_or(""),
            self.nuptk.as_deref().unwrap_or(""),
            if self.is_active { "1" } else { "0" },
        ]
        .join("\u{1f}");
        let digest = Sha256::digest(canonical.as_bytes());
        digest.iter().fold(String::with_capacity(64), |mut acc, b| {
            use std::fmt::Write;
            let _ = write!(acc, "{b:02x}");
            acc
        })
    }
}

fn pick<'a>(obj: &'a Value, names: &[&str]) -> Option<&'a Value> {
    names.iter().find_map(|n| obj.get(*n).filter(|v| !v.is_null()))
}

fn text(value: &Value) -> Option<String> {
    let s = match value {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        // Relasi yang dikirim sebagai objek, mis. {"id":1,"nama":"Keperawatan"}.
        Value::Object(_) => return pick(value, &["nama", "name", "label"]).and_then(text),
        _ => return None,
    };
    let cleaned: String = s.chars().filter(|c| !c.is_control()).collect();
    (!cleaned.is_empty()).then_some(cleaned)
}

fn clip(value: Option<String>, max: usize) -> Option<String> {
    value.map(|v| v.chars().take(max).collect())
}

fn parse_active(value: Option<&Value>) -> bool {
    match value {
        None => true,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().is_some_and(|n| n != 0),
        Some(Value::String(s)) => matches!(
            s.trim().to_lowercase().as_str(),
            "aktif" | "active" | "a" | "1" | "true" | "yes" | "ya"
        ),
        Some(_) => false,
    }
}

fn parse_year(value: Option<&Value>) -> Option<i32> {
    let n = match value? {
        Value::Number(n) => n.as_i64()?,
        Value::String(s) => s.trim().parse::<i64>().ok()?,
        _ => return None,
    };
    i32::try_from(n).ok().filter(|y| (1950..=2100).contains(y))
}

fn parse_email(value: Option<&Value>) -> Option<String> {
    let email = text(value?)?.to_lowercase();
    (email.len() <= 254 && email.validate_email()).then_some(email)
}

fn parse_time(value: Option<&Value>) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value?.as_str()?).ok()
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 32
        && key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/'))
}

/// Normalisasi baris mahasiswa.
///
/// # Errors
/// Alasan singkat tanpa data pribadi bila baris tidak dapat dipakai.
pub fn student_row(raw: &Value) -> Result<Row, &'static str> {
    let key = pick(raw, &["nim", "NIM"]).and_then(text).ok_or("NIM kosong")?;
    if !valid_key(&key) {
        return Err("NIM tidak valid");
    }
    let name = clip(pick(raw, &["nama", "name", "full_name", "nama_lengkap"]).and_then(text), 200).ok_or("nama kosong")?;
    Ok(Row {
        key,
        name,
        email: parse_email(pick(raw, &["email"])),
        unit: clip(pick(raw, &["prodi", "study_program", "program_studi"]).and_then(text), 200),
        cohort_year: parse_year(pick(raw, &["angkatan", "cohort_year", "cohort"])),
        position: None,
        nuptk: None,
        is_active: parse_active(pick(raw, &["is_active", "active", "status_aktif", "status"])),
        source_updated_at: parse_time(pick(raw, &["updated_at"])),
    })
}

/// Normalisasi baris pegawai (NIP; NIDN dipakai bila NIP kosong, mis. dosen).
///
/// # Errors
/// Alasan singkat tanpa data pribadi bila baris tidak dapat dipakai.
pub fn employee_row(raw: &Value) -> Result<Row, &'static str> {
    let key = pick(raw, &["nip", "NIP"])
        .and_then(text)
        .or_else(|| pick(raw, &["nidn", "NIDN"]).and_then(text))
        .ok_or("NIP/NIDN kosong")?;
    if !valid_key(&key) {
        return Err("NIP/NIDN tidak valid");
    }
    let name = clip(pick(raw, &["nama", "name", "full_name", "nama_lengkap"]).and_then(text), 200).ok_or("nama kosong")?;
    Ok(Row {
        key,
        name,
        email: parse_email(pick(raw, &["email"])),
        unit: clip(pick(raw, &["unit", "work_unit", "unit_kerja"]).and_then(text), 200),
        cohort_year: None,
        position: clip(pick(raw, &["jabatan", "position"]).and_then(text), 200),
        nuptk: pick(raw, &["nuptk", "NUPTK"]).and_then(text).filter(|n| (5..=25).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_digit())),
        is_active: parse_active(pick(raw, &["is_active", "active", "status_aktif", "status"])),
        source_updated_at: parse_time(pick(raw, &["updated_at"])),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Upsert {
    Created,
    Updated,
    Unchanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Table {
    Students,
    Employees,
}

impl Table {
    const fn name(self) -> &'static str {
        match self {
            Self::Students => "master_students",
            Self::Employees => "master_employees",
        }
    }

    const fn key_col(self) -> &'static str {
        match self {
            Self::Students => "nim",
            Self::Employees => "nip",
        }
    }

    /// Kolom isi per tabel, urut sama dengan `values()`. Nama berasal dari konstanta, bukan masukan pengguna.
    const fn content_cols(self) -> &'static [&'static str] {
        match self {
            Self::Students => &["full_name", "email", "study_program", "cohort_year", "is_active", "source_hash", "source_updated_at", "last_seen_at"],
            Self::Employees => &["full_name", "email", "work_unit", "position", "nuptk", "is_active", "source_hash", "source_updated_at", "last_seen_at"],
        }
    }

    fn values(self, row: &Row, run_started: DateTime<FixedOffset>) -> Vec<sea_orm::Value> {
        let mut v: Vec<sea_orm::Value> = vec![row.name.clone().into(), row.email.clone().into(), row.unit.clone().into()];
        match self {
            Self::Students => v.push(row.cohort_year.into()),
            Self::Employees => {
                v.push(row.position.clone().into());
                v.push(row.nuptk.clone().into());
            }
        }
        v.push(row.is_active.into());
        v.push(row.hash().into());
        v.push(row.source_updated_at.into());
        v.push(run_started.into());
        v
    }

    fn upsert_sql(self) -> String {
        let (t, k) = (self.name(), self.key_col());
        let cols = self.content_cols();
        let insert_cols = cols.join(", ");
        // $1 = tenant_id, $2 = kunci (NIM/NIP), sisanya mulai dari $3.
        let placeholders: Vec<String> = (3..3 + cols.len()).map(|i| format!("${i}")).collect();
        let updates: Vec<String> = cols.iter().map(|c| format!("{c} = EXCLUDED.{c}")).collect();
        format!(
            "INSERT INTO {t} (tenant_id, {k}, {insert_cols}) VALUES ($1, $2, {ph}) \
             ON CONFLICT (tenant_id, {k}) DO UPDATE SET {up} \
             WHERE {t}.source_hash <> EXCLUDED.source_hash \
             RETURNING (xmax = 0) AS inserted",
            ph = placeholders.join(", "),
            up = updates.join(", "),
        )
    }

    /// Menyisipkan atau memperbarui satu baris. Baris tanpa perubahan inti tidak ditulis ulang.
    ///
    /// # Errors
    /// Galat database.
    pub async fn upsert(
        self,
        db: &DatabaseConnection,
        tenant_id: i64,
        row: &Row,
        run_started: DateTime<FixedOffset>,
    ) -> std::result::Result<Upsert, DbErr> {
        let mut params: Vec<sea_orm::Value> = vec![tenant_id.into(), row.key.clone().into()];
        params.extend(self.values(row, run_started));
        let stmt = Statement::from_sql_and_values(DbBackend::Postgres, self.upsert_sql(), params);
        match db.query_one_raw(stmt).await? {
            None => Ok(Upsert::Unchanged),
            Some(res) => {
                if res.try_get::<bool>("", "inserted")? {
                    Ok(Upsert::Created)
                } else {
                    Ok(Upsert::Updated)
                }
            }
        }
    }

    /// Menandai baris yang terlihat di run ini (termasuk yang tidak berubah).
    ///
    /// # Errors
    /// Galat database.
    pub async fn touch_seen(
        self,
        db: &DatabaseConnection,
        tenant_id: i64,
        keys: &[String],
        run_started: DateTime<FixedOffset>,
    ) -> std::result::Result<(), DbErr> {
        if keys.is_empty() {
            return Ok(());
        }
        let sql = format!(
            "UPDATE {t} SET last_seen_at = $1 \
             WHERE tenant_id = $2 AND last_seen_at < $1 \
               AND {k} IN (SELECT jsonb_array_elements_text($3::jsonb))",
            t = self.name(),
            k = self.key_col()
        );
        let json = serde_json::to_string(keys).unwrap_or_else(|_| "[]".to_string());
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            sql,
            [run_started.into(), tenant_id.into(), json.into()],
        ))
        .await?;
        Ok(())
    }

    /// `(aktif_total, akan_dinonaktifkan)`: baris aktif yang tidak terlihat sejak `run_started`.
    ///
    /// # Errors
    /// Galat database.
    pub async fn deactivation_preview(
        self,
        db: &DatabaseConnection,
        tenant_id: i64,
        run_started: DateTime<FixedOffset>,
    ) -> std::result::Result<(i64, i64), DbErr> {
        let sql = format!(
            "SELECT count(*) AS total, count(*) FILTER (WHERE last_seen_at < $2) AS stale \
             FROM {t} WHERE tenant_id = $1 AND is_active",
            t = self.name()
        );
        let res = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                sql,
                [tenant_id.into(), run_started.into()],
            ))
            .await?
            .ok_or_else(|| DbErr::Custom("hitungan kosong".into()))?;
        Ok((res.try_get("", "total")?, res.try_get("", "stale")?))
    }

    /// Menonaktifkan (bukan menghapus) baris yang hilang dari sumber. `source_hash` dikosongkan
    /// agar kemunculan berikutnya selalu memicu pembaruan (reaktivasi).
    ///
    /// # Errors
    /// Galat database.
    pub async fn deactivate_missing(
        self,
        db: &DatabaseConnection,
        tenant_id: i64,
        run_started: DateTime<FixedOffset>,
    ) -> std::result::Result<u64, DbErr> {
        let sql = format!(
            "UPDATE {t} SET is_active = false, source_hash = repeat('0', 64) \
             WHERE tenant_id = $1 AND is_active AND last_seen_at < $2",
            t = self.name()
        );
        let res = db
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                sql,
                [tenant_id.into(), run_started.into()],
            ))
            .await?;
        Ok(res.rows_affected())
    }
}

/// Mahasiswa aktif di cache lokal yang cocok dengan email (huruf besar/kecil diabaikan).
///
/// # Errors
/// Galat database.
pub async fn active_student_by_email(
    db: &DatabaseConnection,
    tenant_id: i64,
    email: &str,
) -> std::result::Result<Option<master_students::Model>, DbErr> {
    use master_students::{Column, Entity};
    Entity::find()
        .filter(Column::TenantId.eq(tenant_id))
        .filter(Column::IsActive.eq(true))
        .filter(Expr::expr(Func::lower(Expr::col(Column::Email))).eq(email.trim().to_lowercase()))
        .one(db)
        .await
}

/// Pegawai aktif di cache lokal yang cocok dengan email.
///
/// # Errors
/// Galat database.
pub async fn active_employee_by_email(
    db: &DatabaseConnection,
    tenant_id: i64,
    email: &str,
) -> std::result::Result<Option<master_employees::Model>, DbErr> {
    use master_employees::{Column, Entity};
    Entity::find()
        .filter(Column::TenantId.eq(tenant_id))
        .filter(Column::IsActive.eq(true))
        .filter(Expr::expr(Func::lower(Expr::col(Column::Email))).eq(email.trim().to_lowercase()))
        .one(db)
        .await
}

/// Pola ILIKE aman: karakter khusus LIKE dari pengguna di-escape.
fn contains_pattern(q: &str) -> String {
    let escaped: String = q.trim().chars().flat_map(|c| if matches!(c, '%' | '_' | '\\') { vec!['\\', c] } else { vec![c] }).collect();
    format!("%{escaped}%")
}

/// Mencari mahasiswa aktif (NIM atau nama) untuk pilihan di formulir. `q` kosong = daftar awal.
///
/// # Errors
/// Galat database.
pub async fn search_students(
    db: &DatabaseConnection,
    tenant_id: i64,
    q: &str,
    limit: u64,
) -> std::result::Result<Vec<master_students::Model>, DbErr> {
    use master_students::{Column, Entity};
    let mut query = Entity::find().filter(Column::TenantId.eq(tenant_id)).filter(Column::IsActive.eq(true));
    if !q.trim().is_empty() {
        let pattern = contains_pattern(q);
        query = query.filter(
            Condition::any()
                .add(Expr::col(Column::Nim).ilike(pattern.clone()))
                .add(Expr::col(Column::FullName).ilike(pattern)),
        );
    }
    query.order_by_asc(Column::FullName).limit(limit).all(db).await
}

/// Mencari dosen aktif (punya NUPTK) berdasarkan nama/NUPTK.
///
/// # Errors
/// Galat database.
pub async fn search_lecturers(
    db: &DatabaseConnection,
    tenant_id: i64,
    q: &str,
    limit: u64,
) -> std::result::Result<Vec<master_employees::Model>, DbErr> {
    use master_employees::{Column, Entity};
    let mut query = Entity::find()
        .filter(Column::TenantId.eq(tenant_id))
        .filter(Column::IsActive.eq(true))
        .filter(Column::Nuptk.is_not_null());
    if !q.trim().is_empty() {
        let pattern = contains_pattern(q);
        query = query.filter(
            Condition::any()
                .add(Expr::col(Column::Nuptk).ilike(pattern.clone()))
                .add(Expr::col(Column::FullName).ilike(pattern)),
        );
    }
    query.order_by_asc(Column::FullName).limit(limit).all(db).await
}

/// Mahasiswa aktif menurut NIM (nilai kanonik untuk nama).
///
/// # Errors
/// Galat database.
pub async fn student_by_nim(db: &DatabaseConnection, tenant_id: i64, nim: &str) -> std::result::Result<Option<master_students::Model>, DbErr> {
    use master_students::{Column, Entity};
    Entity::find()
        .filter(Column::TenantId.eq(tenant_id))
        .filter(Column::IsActive.eq(true))
        .filter(Column::Nim.eq(nim))
        .one(db)
        .await
}

/// Dosen aktif menurut NUPTK.
///
/// # Errors
/// Galat database.
pub async fn lecturer_by_nuptk(db: &DatabaseConnection, tenant_id: i64, nuptk: &str) -> std::result::Result<Option<master_employees::Model>, DbErr> {
    use master_employees::{Column, Entity};
    Entity::find()
        .filter(Column::TenantId.eq(tenant_id))
        .filter(Column::IsActive.eq(true))
        .filter(Column::Nuptk.eq(nuptk))
        .one(db)
        .await
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn upsert_sql_has_matching_placeholders() {
        for table in [Table::Students, Table::Employees] {
            let sql = table.upsert_sql();
            let row = student_row(&json!({"nim":"1","nama":"A"})).unwrap();
            let params = 2 + table.values(&row, chrono::Utc::now().fixed_offset()).len();
            assert!(sql.contains(&format!("${params}")), "{sql}");
            assert!(!sql.contains(&format!("${}", params + 1)), "{sql}");
            assert_eq!(table.values(&row, chrono::Utc::now().fixed_offset()).len(), table.content_cols().len());
        }
    }

    #[test]
    fn like_wildcards_are_escaped() {
        assert_eq!(contains_pattern("a%b_c\\"), "%a\\%b\\_c\\\\%");
        assert_eq!(contains_pattern("  siti "), "%siti%");
    }

    #[test]
    fn nuptk_only_when_digits_5_to_25() {
        let ok = employee_row(&json!({"nip":"1","nama":"A","nuptk":"1234567890123456"})).unwrap();
        assert_eq!(ok.nuptk.as_deref(), Some("1234567890123456"));
        assert_eq!(employee_row(&json!({"nip":"1","nama":"A","nuptk":"12ab"})).unwrap().nuptk, None);
        assert_eq!(employee_row(&json!({"nip":"1","nama":"A"})).unwrap().nuptk, None);
    }

    #[test]
    fn student_normalizes_common_shapes() {
        let row = student_row(&json!({
            "nim": 2201001,
            "nama": "  Siti  Aminah ",
            "email": "Siti@Kampus.AC.ID",
            "prodi": {"id": 3, "nama": "Keperawatan"},
            "angkatan": "2022",
            "status": "Aktif",
            "nik": "3201xxxxxxxxxxxx",
            "tanggal_lahir": "2003-01-01"
        }))
        .unwrap();
        assert_eq!(row.key, "2201001");
        assert_eq!(row.email.as_deref(), Some("siti@kampus.ac.id"));
        assert_eq!(row.unit.as_deref(), Some("Keperawatan"));
        assert_eq!(row.cohort_year, Some(2022));
        assert!(row.is_active);
    }

    #[test]
    fn sensitive_fields_do_not_affect_hash() {
        let a = student_row(&json!({"nim":"1","nama":"A","nik":"111"})).unwrap();
        let b = student_row(&json!({"nim":"1","nama":"A","nik":"222"})).unwrap();
        assert_eq!(a.hash(), b.hash());
        let c = student_row(&json!({"nim":"1","nama":"B"})).unwrap();
        assert_ne!(a.hash(), c.hash());
    }

    #[test]
    fn rejects_unusable_rows() {
        assert_eq!(student_row(&json!({"nama":"A"})), Err("NIM kosong"));
        assert_eq!(student_row(&json!({"nim":"1; DROP","nama":"A"})), Err("NIM tidak valid"));
        assert_eq!(student_row(&json!({"nim":"1"})), Err("nama kosong"));
        assert_eq!(employee_row(&json!({"nama":"A"})), Err("NIP/NIDN kosong"));
    }

    #[test]
    fn status_parsing() {
        assert!(!student_row(&json!({"nim":"1","nama":"A","status":"Lulus"})).unwrap().is_active);
        assert!(!student_row(&json!({"nim":"1","nama":"A","is_active":false})).unwrap().is_active);
        assert!(!student_row(&json!({"nim":"1","nama":"A","is_active":0})).unwrap().is_active);
        assert!(student_row(&json!({"nim":"1","nama":"A","active":1})).unwrap().is_active);
    }

    #[test]
    fn employee_falls_back_to_nidn_and_ignores_bad_email() {
        let row = employee_row(&json!({
            "nidn": "0412038801", "name": "Budi", "email": "bukan-email",
            "unit": "Prodi Ners", "jabatan": "Dosen"
        }))
        .unwrap();
        assert_eq!(row.key, "0412038801");
        assert_eq!(row.email, None);
        assert_eq!(row.position.as_deref(), Some("Dosen"));
    }

    #[test]
    fn year_bounds() {
        assert_eq!(student_row(&json!({"nim":"1","nama":"A","angkatan":1800})).unwrap().cohort_year, None);
    }
}
