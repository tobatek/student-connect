use crate::config::AppConfig;
use crate::http::{Request, Response};

const ALLOWED_METHODS: &str = "GET, POST, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS: &str = "Content-Type, Authorization, X-User-Id, X-Tenant-Id, X-User-Role";

/// Returns the request origin only if it exactly matches the configured allowlist.
fn allowed_origin<'a>(request: &'a Request, config: &AppConfig) -> Option<&'a str> {
    let origin = request.header("origin")?;
    config
        .security
        .cors_allowed_origins
        .iter()
        .any(|allowed| allowed == origin)
        .then_some(origin)
}

pub fn preflight(request: &Request, config: &AppConfig) -> Response {
    match allowed_origin(request, config) {
        Some(origin) => with_origin(Response::empty(204), origin)
            .with_header("Access-Control-Allow-Methods", ALLOWED_METHODS)
            .with_header("Access-Control-Allow-Headers", ALLOWED_HEADERS)
            .with_header("Access-Control-Max-Age", "600"),
        None => Response::error(403, "origin is not allowed"),
    }
}

pub fn apply(request: &Request, config: &AppConfig, response: Response) -> Response {
    match allowed_origin(request, config) {
        Some(origin) => with_origin(response, origin),
        None => response.with_header("Vary", "Origin"),
    }
}

fn with_origin(response: Response, origin: &str) -> Response {
    response
        .with_header("Access-Control-Allow-Origin", origin)
        .with_header("Vary", "Origin")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(origin: &str) -> Request {
        Request::parse(&format!(
            "OPTIONS /api/x HTTP/1.1\r\nOrigin: {origin}\r\n\r\n"
        ))
    }

    #[test]
    fn allows_only_configured_origins() {
        let config = AppConfig::from_env();
        let allowed = config.security.cors_allowed_origins[0].clone();

        let ok = preflight(&request(&allowed), &config);
        assert_eq!(ok.status_code, 204);
        assert!(ok
            .headers
            .iter()
            .any(|(name, value)| *name == "Access-Control-Allow-Origin" && *value == allowed));

        let denied = preflight(&request("https://evil.example"), &config);
        assert_eq!(denied.status_code, 403);
        assert!(denied.headers.is_empty());
    }

    #[test]
    fn never_reflects_unknown_origin_on_normal_responses() {
        let config = AppConfig::from_env();
        let response = apply(
            &request("https://evil.example"),
            &config,
            Response::empty(200),
        );

        assert!(!response
            .headers
            .iter()
            .any(|(name, _)| *name == "Access-Control-Allow-Origin"));
    }
}
