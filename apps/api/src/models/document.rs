use serde_json::{json, Value};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Document {
    pub id: String,
    pub tenant_id: String,
    pub original_filename: String,
    pub object_key: String,
    pub public_url: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub checksum: String,
    pub record_type: String,
    pub record_id: String,
    pub document_type: String,
    pub is_locked: bool,
    pub created_at: u64,
}

impl Document {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "tenant_id": self.tenant_id,
            "original_filename": self.original_filename,
            "object_key": self.object_key,
            "public_url": self.public_url,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "checksum": self.checksum,
            "record_type": self.record_type,
            "record_id": self.record_id,
            "document_type": self.document_type,
            "is_locked": self.is_locked,
            "created_at": self.created_at
        })
    }
}
