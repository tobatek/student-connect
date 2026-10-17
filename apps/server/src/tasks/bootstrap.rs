//! Membuat tenant pertama dan akun SUPER_ADMIN awal (akun diwajibkan ganti kata sandi saat login).

use loco_rs::prelude::*;

use crate::models::{
    tenants,
    users::{self, NewUser},
};

pub struct Bootstrap;

#[async_trait]
impl Task for Bootstrap {
    fn task(&self) -> TaskInfo {
        TaskInfo {
            name: "bootstrap".to_string(),
            detail: "Buat tenant + SUPER_ADMIN awal.\nUsage: cargo loco task bootstrap slug:ameta nama_pt:\"STIKES Ameta\" kode_pt:999999 tahun:2026 email:admin@kampus.ac.id name:\"Admin\" password:\"<sandi-sementara-kuat>\"".to_string(),
        }
    }

    async fn run(&self, ctx: &AppContext, vars: &task::Vars) -> Result<()> {
        let arg = |k: &str| -> Result<String> {
            vars.cli_arg(k).map(ToString::to_string).map_err(|_| Error::string(&format!("argumen `{k}` wajib")))
        };
        let slug = arg("slug")?;
        let tahun: i32 = arg("tahun")?.parse().map_err(|_| Error::string("tahun harus angka"))?;
        if !regex::Regex::new(r"^[a-z0-9][a-z0-9-]{1,62}$").map_err(|e| Error::string(&e.to_string()))?.is_match(&slug) {
            return Err(Error::string("slug: huruf kecil/angka/-, 2-63 karakter"));
        }

        let existing = tenants::Entity::find().filter(tenants::Column::Slug.eq(slug.as_str())).one(&ctx.db).await?;
        let tenant = if let Some(t) = existing {
            t
        } else {
            tenants::ActiveModel {
                pid: ActiveValue::set(Uuid::new_v4()),
                slug: ActiveValue::set(slug),
                nama_pt: ActiveValue::set(arg("nama_pt")?),
                kode_pt: ActiveValue::set(arg("kode_pt")?),
                tahun_aktif: ActiveValue::set(tahun),
                allow_kab_rekognisi: ActiveValue::set(false),
                ..Default::default()
            }
            .insert(&ctx.db)
            .await?
        };

        let mut new = NewUser {
            tenant_id: tenant.id,
            email: arg("email")?,
            name: arg("name")?,
            role: "SUPER_ADMIN".to_string(),
            password: arg("password")?,
        };
        if let Err(errors) = new.validate() {
            return Err(Error::string(&format!("masukan tidak valid: {:?}", errors.0)));
        }
        let user = users::Model::create(&ctx.db, &new).await?;
        tracing::info!(tenant = %tenant.slug, user = %user.pid, "bootstrap selesai");
        println!("Tenant `{}` dan SUPER_ADMIN `{}` dibuat. Wajib ganti kata sandi saat login pertama.", tenant.slug, user.email);
        Ok(())
    }
}
