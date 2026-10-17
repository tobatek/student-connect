//! Validasi URL: tautan bukti dari pengguna dan URL API eksternal (anti-SSRF, A.8.26).

use std::net::IpAddr;
use url::{Host, Url};

/// Tautan bukti yang disimpan dan diteruskan ke SIMKATMAWA. Hanya http(s), tanpa kredensial.
///
/// # Errors
/// Pesan alasan penolakan.
pub fn public_link(raw: &str) -> Result<String, &'static str> {
    let raw = raw.trim();
    if raw.len() > 2048 {
        return Err("URL terlalu panjang (maks 2048 karakter).");
    }
    let url = Url::parse(raw).map_err(|_| "URL tidak valid.")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("URL harus diawali http:// atau https://.");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL tidak boleh memuat username/password.");
    }
    if url.host_str().is_none() {
        return Err("URL tidak memiliki host.");
    }
    Ok(url.to_string())
}

/// URL API eksternal yang akan dihubungi server: wajib https dan host harus ada
/// dalam allowlist. Alamat IP (termasuk loopback/privat/metadata cloud) selalu ditolak.
///
/// # Errors
/// Pesan alasan penolakan.
pub fn outbound_api(raw: &str, allowed_hosts: &[String]) -> Result<Url, &'static str> {
    let url = Url::parse(raw.trim()).map_err(|_| "URL API tidak valid.")?;
    if url.scheme() != "https" {
        return Err("URL API wajib https.");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL API tidak boleh memuat kredensial.");
    }
    match url.host() {
        Some(Host::Domain(domain)) => {
            let domain = domain.to_ascii_lowercase();
            if allowed_hosts.iter().any(|h| h.eq_ignore_ascii_case(&domain)) {
                Ok(url)
            } else {
                Err("Host API tidak ada dalam daftar yang diizinkan.")
            }
        }
        Some(Host::Ipv4(ip)) => Err(reject_ip(IpAddr::V4(ip))),
        Some(Host::Ipv6(ip)) => Err(reject_ip(IpAddr::V6(ip))),
        None => Err("Host API tidak diizinkan."),
    }
}

/// Tautan yang akan dikirim ke SIMKATMAWA harus bisa dibuka orang di internet: bukan localhost,
/// alamat jaringan privat/loopback/link-local, nama host tanpa titik, atau domain internal.
///
/// # Errors
/// Pesan alasan penolakan.
pub fn publicly_routable(raw: &str) -> Result<(), &'static str> {
    const NOT_PUBLIC: &str = "Tautan harus alamat publik di internet (bukan localhost/jaringan internal).";
    let url = Url::parse(raw.trim()).map_err(|_| "URL tidak valid.")?;
    match url.host() {
        Some(Host::Domain(domain)) => {
            let d = domain.to_ascii_lowercase();
            let internal = [".localhost", ".local", ".internal", ".lan", ".intranet", ".home", ".corp"];
            if !d.contains('.') || d == "localhost" || internal.iter().any(|s| d.ends_with(s)) {
                return Err(NOT_PUBLIC);
            }
            Ok(())
        }
        Some(Host::Ipv4(ip)) => {
            if ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified() || ip.is_broadcast() {
                Err(NOT_PUBLIC)
            } else {
                Ok(())
            }
        }
        Some(Host::Ipv6(ip)) => {
            let unique_local = (ip.segments()[0] & 0xfe00) == 0xfc00;
            let link_local = (ip.segments()[0] & 0xffc0) == 0xfe80;
            if ip.is_loopback() || ip.is_unspecified() || unique_local || link_local {
                Err(NOT_PUBLIC)
            } else {
                Ok(())
            }
        }
        None => Err(NOT_PUBLIC),
    }
}

const fn reject_ip(_ip: IpAddr) -> &'static str {
    "Gunakan nama host yang diizinkan, bukan alamat IP."
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_link_rules() {
        assert!(public_link("https://drive.example.ac.id/file.pdf").is_ok());
        assert!(public_link("javascript:alert(1)").is_err());
        assert!(public_link("ftp://x.id/a").is_err());
        assert!(public_link("https://user:pw@x.id/").is_err());
        assert!(public_link(&format!("https://x.id/{}", "a".repeat(3000))).is_err());
    }

    #[test]
    fn only_public_hosts_are_routable() {
        for ok in ["https://dokumen.kampus.ac.id/a.pdf", "http://8.8.8.8/x", "https://pub-abc.r2.dev/k.pdf"] {
            assert!(publicly_routable(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://localhost:5150/files/a.pdf",
            "http://127.0.0.1/a",
            "http://10.1.2.3/a",
            "http://192.168.0.5/a",
            "http://169.254.169.254/latest",
            "http://[::1]/a",
            "http://[fd00::1]/a",
            "http://fileserver/a.pdf",
            "https://nas.kampus.local/a.pdf",
            "https://app.internal/a",
        ] {
            assert!(publicly_routable(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn outbound_is_allowlisted() {
        let allowed = vec!["simkatmawa.kemdiktisaintek.go.id".to_string()];
        assert!(outbound_api("https://simkatmawa.kemdiktisaintek.go.id", &allowed).is_ok());
        assert!(outbound_api("http://simkatmawa.kemdiktisaintek.go.id", &allowed).is_err());
        assert!(outbound_api("https://evil.example.com", &allowed).is_err());
        assert!(outbound_api("https://127.0.0.1", &allowed).is_err());
        assert!(outbound_api("https://169.254.169.254/latest", &allowed).is_err());
        assert!(outbound_api("https://[::1]/", &allowed).is_err());
    }
}
