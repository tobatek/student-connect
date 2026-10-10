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
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            500 => "Internal Server Error",
            _ => "OK",
        };

        Self {
            status_code,
            reason,
            body,
        }
    }

    pub fn internal_error(error: String) -> Self {
        Self::json(
            500,
            format!(
                r#"{{"status":"error","message":"{}"}}"#,
                escape_json(&error)
            ),
        )
    }

    pub fn to_http(&self) -> String {
        format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\n\r\n{}",
            self.status_code,
            self.reason,
            self.body.len(),
            self.body
        )
    }
}

pub fn escape_json(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
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
                Some((name.to_string(), value.to_string()))
            }
        })
        .collect()
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
}
