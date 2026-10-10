use crate::http::Request;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthContext {
    pub user_id: String,
    pub tenant_id: String,
    pub role: Role,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    SuperAdmin,
    AdminPt,
    AdminKemahasiswaan,
    AdminProdi,
    Mahasiswa,
    DosenPembina,
    Auditor,
}

impl Role {
    pub const fn all() -> &'static [Self] {
        &[
            Self::SuperAdmin,
            Self::AdminPt,
            Self::AdminKemahasiswaan,
            Self::AdminProdi,
            Self::Mahasiswa,
            Self::DosenPembina,
            Self::Auditor,
        ]
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_uppercase().as_str() {
            "SUPER_ADMIN" => Some(Self::SuperAdmin),
            "ADMIN_PT" => Some(Self::AdminPt),
            "ADMIN_KEMAHASISWAAN" => Some(Self::AdminKemahasiswaan),
            "ADMIN_PRODI" => Some(Self::AdminProdi),
            "MAHASISWA" => Some(Self::Mahasiswa),
            "DOSEN_PEMBINA" => Some(Self::DosenPembina),
            "AUDITOR" => Some(Self::Auditor),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
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
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthError {
    /// Missing or malformed credentials (HTTP 401).
    Unauthenticated(&'static str),
    /// Authenticated, but the role may not use the endpoint (HTTP 403).
    Forbidden(Role),
}

impl AuthError {
    pub fn status_code(&self) -> u16 {
        match self {
            Self::Unauthenticated(_) => 401,
            Self::Forbidden(_) => 403,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::Unauthenticated(message) => (*message).to_string(),
            Self::Forbidden(role) => format!("role {} is not allowed", role.as_str()),
        }
    }
}

pub fn authorize(request: &Request, allowed_roles: &[Role]) -> Result<AuthContext, AuthError> {
    let user_id = request
        .header("x-user-id")
        .filter(|value| !value.trim().is_empty())
        .ok_or(AuthError::Unauthenticated("missing auth user"))?;
    let tenant_id = request
        .header("x-tenant-id")
        .filter(|value| !value.trim().is_empty())
        .ok_or(AuthError::Unauthenticated("missing auth tenant"))?;
    let role = request
        .header("x-user-role")
        .and_then(Role::parse)
        .ok_or(AuthError::Unauthenticated("missing auth role"))?;

    if !allowed_roles.contains(&role) {
        return Err(AuthError::Forbidden(role));
    }

    Ok(AuthContext {
        user_id: user_id.to_string(),
        tenant_id: tenant_id.to_string(),
        role,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorizes_allowed_role() {
        let request = Request::parse(
            "GET /api/tenant HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: ADMIN_PT\r\n\r\n",
        );
        let auth = authorize(&request, &[Role::AdminPt]).expect("role should be allowed");

        assert_eq!(auth.role, Role::AdminPt);
    }

    #[test]
    fn rejects_disallowed_role() {
        let request = Request::parse(
            "GET /api/tenant HTTP/1.1\r\nx-user-id: u-1\r\nx-tenant-id: t-1\r\nx-user-role: MAHASISWA\r\n\r\n",
        );

        assert_eq!(
            authorize(&request, &[Role::AdminPt]),
            Err(AuthError::Forbidden(Role::Mahasiswa))
        );
    }
}
