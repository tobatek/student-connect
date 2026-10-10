use crate::config::R2Config;
use crate::validators::upload::safe_filename;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static OBJECT_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn build_object_key(
    tenant_slug: &str,
    year: &str,
    record_type: &str,
    record_id: &str,
    document_type: &str,
    original_filename: &str,
) -> String {
    format!(
        "tenants/{tenant_slug}/simkatmawa/{year}/{record_type}/{record_id}/{document_type}/{}-{}",
        unique_component(),
        safe_filename(original_filename)
    )
}

pub fn public_url(config: &R2Config, object_key: &str) -> String {
    format!(
        "{}/{}",
        config.public_base_url.trim_end_matches('/'),
        object_key
    )
}

fn unique_component() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = OBJECT_COUNTER.fetch_add(1, Ordering::SeqCst);

    format!("{nanos:x}-{counter:x}")
}
