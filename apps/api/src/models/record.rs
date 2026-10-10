use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RecordKind {
    PrestasiMandiri,
    Sertifikasi,
    Rekognisi,
    Kejuaraan,
    Institusi,
    EnumMapping,
}

impl RecordKind {
    pub fn id_prefix(self) -> &'static str {
        match self {
            Self::PrestasiMandiri => "pm",
            Self::Sertifikasi => "ser",
            Self::Rekognisi => "rek",
            Self::Kejuaraan => "kej",
            Self::Institusi => "ins",
            Self::EnumMapping => "map",
        }
    }

    pub fn entity_name(self) -> &'static str {
        match self {
            Self::PrestasiMandiri => "prestasi_mandiri",
            Self::Sertifikasi => "sertifikasi",
            Self::Rekognisi => "rekognisi",
            Self::Kejuaraan => "kejuaraan",
            Self::Institusi => "institusi",
            Self::EnumMapping => "enum_mapping",
        }
    }
}

/// `status`, `created_by` and `tenant_id` are server-managed and never read from request bodies.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Record {
    pub id: String,
    pub tenant_id: String,
    pub status: String,
    pub created_by: String,
    pub data: Value,
    pub created_at: u64,
    pub updated_at: u64,
}

impl Record {
    /// Records already queued or sent to SIMKATMAWA must not be edited.
    pub fn is_locked(&self) -> bool {
        matches!(self.status.as_str(), "QUEUED" | "SENDING" | "SENT")
    }

    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "tenant_id": self.tenant_id,
            "status": self.status,
            "created_by": self.created_by,
            "data": self.data,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        })
    }
}
