//! Pembatas laju jendela-tetap dalam memori (anti brute force, A.8.6 dan A.8.20).
//! Cukup untuk satu instance; untuk multi-instance pindahkan ke cache bersama.

use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

static STORE: OnceLock<Mutex<HashMap<String, (u32, Instant)>>> = OnceLock::new();
const MAX_KEYS: usize = 50_000;

/// Mengembalikan `true` bila permintaan masih diizinkan.
#[must_use]
pub fn allow(key: &str, limit: u32, window: Duration) -> bool {
    let store = STORE.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut map) = store.lock() else {
        // Mutex beracun: gagal tertutup.
        return false;
    };
    let now = Instant::now();
    if map.len() >= MAX_KEYS {
        map.retain(|_, (_, started)| now.duration_since(*started) < window);
        if map.len() >= MAX_KEYS {
            return false;
        }
    }
    let entry = map.entry(key.to_string()).or_insert((0, now));
    if now.duration_since(entry.1) >= window {
        *entry = (0, now);
    }
    entry.0 += 1;
    entry.0 <= limit
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_after_limit() {
        let key = "test:blocks_after_limit";
        let w = Duration::from_secs(60);
        assert!(allow(key, 2, w));
        assert!(allow(key, 2, w));
        assert!(!allow(key, 2, w));
    }

    #[test]
    fn keys_are_independent() {
        let w = Duration::from_secs(60);
        assert!(allow("test:a", 1, w));
        assert!(allow("test:b", 1, w));
    }
}
