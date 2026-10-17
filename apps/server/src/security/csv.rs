//! Ekspor CSV aman dari formula injection (OWASP CSV Injection, A.8.28).

const DANGEROUS_LEADERS: [char; 7] = ['=', '+', '-', '@', '\t', '\r', '\n'];

/// Menetralkan satu sel dan mengutip sesuai RFC 4180. Data asli tidak diubah.
#[must_use]
pub fn cell(value: &str) -> String {
    let mut text = value.to_string();
    if text.starts_with(DANGEROUS_LEADERS) {
        text.insert(0, '\'');
    }
    if text.contains([',', '"', '\n', '\r']) || text.starts_with('\'') {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

#[must_use]
pub fn row(cells: &[&str]) -> String {
    cells.iter().map(|c| cell(c)).collect::<Vec<_>>().join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutralises_formulas() {
        for payload in [
            "=HYPERLINK(\"http://x\",\"y\")",
            "+1+1",
            "-cmd|' /C calc'!A0",
            "@SUM(1+1)",
            "\tx",
        ] {
            assert!(cell(payload).trim_matches('"').starts_with('\''), "{payload}");
        }
    }

    #[test]
    fn leaves_plain_values_and_quotes_specials() {
        assert_eq!(cell("Budi"), "Budi");
        assert_eq!(cell("a,b"), "\"a,b\"");
        assert_eq!(cell("say \"hi\""), "\"say \"\"hi\"\"\"");
    }
}
