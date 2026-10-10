use std::collections::HashMap;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub query: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Response {
    pub status_code: u16,
    pub reason: &'static str,
    pub headers: Vec<(&'static str, String)>,
    pub body: String,
}

impl Request {
    pub fn parse(raw: &str) -> Self {
        let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((raw, ""));
        let mut lines = head.lines();
        let request_line = lines.next().unwrap_or_default();
        let mut request_parts = request_line.split_whitespace();
        let method = request_parts.next().unwrap_or_default().to_string();
        let raw_target = request_parts.next().unwrap_or_default();
        let (path, raw_query) = raw_target.split_once('?').unwrap_or((raw_target, ""));
        let path = path.to_string();
        let query = parse_query(raw_query);
        let mut headers = HashMap::new();

        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
            }
        }

        Self {
            method,
            path,
            query,
            headers,
            body: body.to_string(),
        }
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .get(&name.to_ascii_lowercase())
            .map(String::as_str)
    }

    pub fn query_u64(&self, name: &str, default: u64, min: u64, max: u64) -> u64 {
        self.query
            .get(name)
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(default)
            .clamp(min, max)
    }
}

impl Response {
    pub fn json(status_code: u16, body: String) -> Self {
        let reason = match status_code {
            200 => "OK",
            201 => "Created",
            202 => "Accepted",
            204 => "No Content",
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            409 => "Conflict",
            413 => "Payload Too Large",
            429 => "Too Many Requests",
            431 => "Request Header Fields Too Large",
            500 => "Internal Server Error",
            503 => "Service Unavailable",
            _ => "OK",
        };

        Self {
            status_code,
            reason,
            headers: Vec::new(),
            body,
        }
    }

    /// The real error goes to stderr only; clients get a generic message.
    pub fn internal_error(error: String) -> Self {
        eprintln!("internal error: {error}");
        Self::error(500, "internal server error")
    }

    pub fn error(status_code: u16, message: &str) -> Self {
        Self::json(
            status_code,
            format!(
                r#"{{"status":"error","message":"{}"}}"#,
                escape_json(message)
            ),
        )
    }

    pub fn empty(status_code: u16) -> Self {
        Self::json(status_code, String::new())
    }

    pub fn with_header(mut self, name: &'static str, value: impl Into<String>) -> Self {
        self.headers.push((name, value.into()));
        self
    }

    pub fn to_http(&self) -> String {
        let mut http = format!(
            "HTTP/1.1 {} {}\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Cache-Control: no-store\r\n\
             X-Content-Type-Options: nosniff\r\n\
             X-Frame-Options: DENY\r\n\
             Referrer-Policy: no-referrer\r\n\
             Content-Security-Policy: default-src 'none'; frame-ancestors 'none'\r\n\
             Connection: close\r\n\
             Content-Length: {}\r\n",
            self.status_code,
            self.reason,
            self.body.len()
        );
        for (name, value) in &self.headers {
            // Values come from our own code or a validated origin; never allow header injection.
            if !value.contains(['\r', '\n']) {
                http.push_str(&format!("{name}: {value}\r\n"));
            }
        }
        http.push_str("\r\n");
        http.push_str(&self.body);
        http
    }
}

pub fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            ch if (ch as u32) < 0x20 => escaped.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => escaped.push(ch),
        }
    }
    escaped
}

fn parse_query(raw_query: &str) -> HashMap<String, String> {
    raw_query
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let (name, value) = part.split_once('=').unwrap_or((part, ""));
            if name.is_empty() {
                None
            } else {
                Some((percent_decode(name), percent_decode(value)))
            }
        })
        .collect()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => decoded.push(b' '),
            b'%' => match bytes.get(index + 1..index + 3).and_then(hex_pair) {
                Some(byte) => {
                    decoded.push(byte);
                    index += 2;
                }
                None => decoded.push(b'%'),
            },
            byte => decoded.push(byte),
        }
        index += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn hex_pair(pair: &[u8]) -> Option<u8> {
    u8::from_str_radix(std::str::from_utf8(pair).ok()?, 16).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_body_after_headers() {
        let request = Request::parse(
            "POST /api/prestasi-mandiri HTTP/1.1\r\ncontent-length: 17\r\n\r\n{\"lomba\":\"A\"}",
        );

        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api/prestasi-mandiri");
        assert_eq!(request.body, r#"{"lomba":"A"}"#);
    }

    #[test]
    fn escapes_control_characters_in_json() {
        assert_eq!(escape_json("a\tb\u{1}\"c\\"), "a\\tb\\u0001\\\"c\\\\");
    }

    #[test]
    fn decodes_percent_encoded_query() {
        let request = Request::parse("GET /x?q=a%20b%2Fc&page=2&bad=%zz HTTP/1.1\r\n\r\n");

        assert_eq!(request.query.get("q").map(String::as_str), Some("a b/c"));
        assert_eq!(request.query.get("bad").map(String::as_str), Some("%zz"));
        assert_eq!(request.query_u64("page", 1, 1, 10), 2);
    }

    #[test]
    fn response_has_security_headers_and_blocks_header_injection() {
        let http = Response::json(200, "{}".to_string())
            .with_header("X-Test", "ok")
            .with_header("X-Bad", "a\r\nSet-Cookie: x=1")
            .to_http();

        assert!(http.contains("X-Content-Type-Options: nosniff"));
        assert!(http.contains("X-Test: ok"));
        assert!(!http.contains("Set-Cookie"));
    }
}
