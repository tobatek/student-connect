//! Memastikan berkas yang kita unggah benar-benar bisa dibuka publik (bucket R2 publik) sebelum
//! tautannya dikirim ke SIMKATMAWA. Hanya dipanggil untuk URL di bawah `storage.public_base_url`
//! (host dari konfigurasi), bukan URL buatan pengguna, sehingga bukan jalur SSRF.

use std::time::Duration;

/// `true` bila URL menjawab 2xx tanpa kredensial. Redirect tidak diikuti.
pub async fn is_publicly_reachable(url: &str) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(4))
        .user_agent("StudentConnect/0.1 (link-check)")
        .build()
    else {
        return false;
    };
    match client.head(url).send().await {
        Ok(r) if r.status().is_success() => true,
        // Sebagian CDN menolak HEAD: coba GET 1 byte.
        Ok(r) if matches!(r.status().as_u16(), 403 | 405 | 501) => client
            .get(url)
            .header("Range", "bytes=0-0")
            .send()
            .await
            .is_ok_and(|g| g.status().is_success()),
        _ => false,
    }
}
