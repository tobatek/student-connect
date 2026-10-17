//! RBAC: peran dan izin. Backend adalah satu-satunya sumber kebenaran (A.5.15, A.5.18).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Role {
    SuperAdmin,
    AdminPt,
    AdminKemahasiswaan,
    AdminProdi,
    Mahasiswa,
    DosenPembina,
    Auditor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Perm {
    RecordRead,
    RecordWrite,
    RecordVerify,
    RecordSubmit,
    RecordDelete,
    EventWrite,
    InstitusiWrite,
    DocumentUpload,
    DocumentDelete,
    CredentialManage,
    TenantManage,
    UserManage,
    SettingsManage,
    LogsRead,
    AuditRead,
    Export,
}

impl Perm {
    pub const ALL: [Self; 16] = [
        Self::RecordRead,
        Self::RecordWrite,
        Self::RecordVerify,
        Self::RecordSubmit,
        Self::RecordDelete,
        Self::EventWrite,
        Self::InstitusiWrite,
        Self::DocumentUpload,
        Self::DocumentDelete,
        Self::CredentialManage,
        Self::TenantManage,
        Self::UserManage,
        Self::SettingsManage,
        Self::LogsRead,
        Self::AuditRead,
        Self::Export,
    ];

    /// Nama stabil untuk klien (hanya untuk menyembunyikan UI; backend tetap memeriksa).
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::RecordRead => "record.read",
            Self::RecordWrite => "record.write",
            Self::RecordVerify => "record.verify",
            Self::RecordSubmit => "record.submit",
            Self::RecordDelete => "record.delete",
            Self::EventWrite => "event.write",
            Self::InstitusiWrite => "institusi.write",
            Self::DocumentUpload => "document.upload",
            Self::DocumentDelete => "document.delete",
            Self::CredentialManage => "credential.manage",
            Self::TenantManage => "tenant.manage",
            Self::UserManage => "user.manage",
            Self::SettingsManage => "settings.manage",
            Self::LogsRead => "logs.read",
            Self::AuditRead => "audit.read",
            Self::Export => "export",
        }
    }
}

impl Role {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "SUPER_ADMIN" => Self::SuperAdmin,
            "ADMIN_PT" => Self::AdminPt,
            "ADMIN_KEMAHASISWAAN" => Self::AdminKemahasiswaan,
            "ADMIN_PRODI" => Self::AdminProdi,
            "MAHASISWA" => Self::Mahasiswa,
            "DOSEN_PEMBINA" => Self::DosenPembina,
            "AUDITOR" => Self::Auditor,
            _ => return None,
        })
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SuperAdmin => "SUPER_ADMIN",
            Self::AdminPt => "ADMIN_PT",
            Self::AdminKemahasiswaan => "ADMIN_KEMAHASISWAAN",
            Self::AdminProdi => "ADMIN_PRODI",
            Self::Mahasiswa => "MAHASISWA",
            Self::DosenPembina => "DOSEN_PEMBINA",
            Self::Auditor => "AUDITOR",
        }
    }

    /// Matriks izin. Default-deny: izin yang tidak tercantum ditolak.
    #[must_use]
    pub const fn can(self, perm: Perm) -> bool {
        use Perm::{
            AuditRead, DocumentDelete, DocumentUpload, EventWrite, Export, InstitusiWrite,
            LogsRead, RecordDelete, RecordRead, RecordSubmit, RecordVerify, RecordWrite,
            SettingsManage,
        };
        match self {
            Self::SuperAdmin | Self::AdminPt => true,
            Self::AdminKemahasiswaan => matches!(
                perm,
                RecordRead
                    | RecordWrite
                    | RecordVerify
                    | RecordSubmit
                    | RecordDelete
                    | EventWrite
                    | InstitusiWrite
                    | DocumentUpload
                    | DocumentDelete
                    | LogsRead
                    | Export
                    | SettingsManage
            ),
            Self::AdminProdi => matches!(
                perm,
                RecordRead | RecordWrite | EventWrite | DocumentUpload | Export
            ),
            Self::DosenPembina | Self::Mahasiswa => {
                matches!(perm, RecordRead | RecordWrite | DocumentUpload)
            }
            Self::Auditor => matches!(perm, RecordRead | LogsRead | AuditRead | Export),
        }
    }

    /// Peran yang hanya boleh melihat data miliknya sendiri.
    #[must_use]
    pub const fn sees_only_own(self) -> bool {
        matches!(self, Self::Mahasiswa)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_default_deny() {
        for r in [
            Role::SuperAdmin,
            Role::AdminPt,
            Role::AdminKemahasiswaan,
            Role::AdminProdi,
            Role::Mahasiswa,
            Role::DosenPembina,
            Role::Auditor,
        ] {
            assert_eq!(Role::parse(r.as_str()), Some(r));
        }
        assert!(Role::parse("ROOT").is_none());
        assert!(!Role::Mahasiswa.can(Perm::RecordSubmit));
        assert!(!Role::Auditor.can(Perm::RecordWrite));
        assert!(!Role::AdminKemahasiswaan.can(Perm::CredentialManage));
        assert!(Role::AdminPt.can(Perm::CredentialManage));
    }
}
