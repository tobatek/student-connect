//! Pemetaan nilai internal -> kode SIMKATMAWA.

use std::collections::HashSet;

use loco_rs::prelude::*;
use serde::Deserialize;
use serde_json::json;

use crate::{
    errors::FieldErrors,
    models::{
        audit_logs::Outcome,
        enum_mappings::{self, MappingIn},
    },
    security::{principal::Principal, roles::Perm},
    views::MappingView,
};

use super::support::{audit, map_model};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateMappings {
    mappings: Vec<MappingIn>,
}

#[debug_handler]
async fn show(State(ctx): State<AppContext>, p: Principal) -> Result<Response> {
    p.require(Perm::RecordRead)?;
    let overrides = enum_mappings::Model::list(&ctx.db, p.tenant_id()).await.map_err(map_model)?;
    let view: Vec<MappingView> = enum_mappings::catalog()
        .into_iter()
        .map(|(group, value, label)| {
            overrides
                .iter()
                .find(|m| m.group_name == group && m.internal_value == value)
                .map_or_else(
                    || MappingView {
                        group_name: group.to_string(),
                        internal_value: value.to_string(),
                        simkatmawa_code: value.to_string(),
                        label: label.to_string(),
                        is_override: false,
                    },
                    MappingView::from_override,
                )
        })
        .collect();
    format::json(view)
}

#[debug_handler]
async fn update(State(ctx): State<AppContext>, p: Principal, Json(params): Json<UpdateMappings>) -> Result<Response> {
    p.require(Perm::SettingsManage)?;
    let mut errors = FieldErrors::default();
    if params.mappings.is_empty() || params.mappings.len() > 100 {
        errors.add("mappings", "Kirim 1-100 pemetaan.");
    }
    let known: HashSet<(&str, &str)> = enum_mappings::catalog().into_iter().map(|(g, v, _)| (g, v)).collect();
    for (i, m) in params.mappings.iter().enumerate() {
        if let Err(e) = m.validate() {
            for (field, msg) in e.0 {
                errors.add(&format!("mappings[{i}].{field}"), &msg);
            }
        } else if !known.contains(&(m.group_name.as_str(), m.internal_value.as_str())) {
            errors.add(&format!("mappings[{i}].internal_value"), "Nilai internal tidak ada dalam katalog.");
        }
    }
    errors.into_result()?;
    for m in &params.mappings {
        enum_mappings::Model::upsert(&ctx.db, p.tenant_id(), m).await.map_err(map_model)?;
    }
    audit(&ctx, &p, "settings.enum_mappings.update", "enum_mapping", None, Outcome::Success, json!({"count": params.mappings.len()})).await?;
    show(State(ctx), p).await
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("/api/settings")
        .add("/enum-mappings", get(show))
        .add("/enum-mappings", put(update))
}
