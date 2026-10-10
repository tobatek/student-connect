use crate::app;
use crate::config::AppConfig;
use crate::http::{Request, Response};
use crate::state::AppState;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

const MAX_HEADER_BYTES: usize = 16 * 1024;
/// Uploads only send metadata, so request bodies stay small.
const MAX_BODY_BYTES: usize = 1024 * 1024;
const MAX_CONNECTIONS: usize = 64;
const SOCKET_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_DEADLINE: Duration = Duration::from_secs(10);

pub fn serve(listener: TcpListener, config: Arc<AppConfig>, state: Arc<AppState>) {
    let active = Arc::new(AtomicUsize::new(0));

    for stream in listener.incoming() {
        let mut stream = match stream {
            Ok(stream) => stream,
            Err(error) => {
                eprintln!("connection error: {error}");
                continue;
            }
        };

        if active.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            active.fetch_sub(1, Ordering::SeqCst);
            let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));
            let _ = stream.write_all(Response::error(503, "server is busy").to_http().as_bytes());
            continue;
        }

        let (config, state, active) = (config.clone(), state.clone(), active.clone());
        thread::spawn(move || {
            handle_connection(stream, &config, &state);
            active.fetch_sub(1, Ordering::SeqCst);
        });
    }
}

fn handle_connection(mut stream: TcpStream, config: &AppConfig, state: &AppState) {
    let response = match read_http_request(&mut stream) {
        Ok(raw) => app::handle(&Request::parse(&raw), config, state),
        Err(ReadError::Rejected(status, message)) => Response::error(status, message),
        Err(ReadError::Io(error)) => {
            eprintln!("read error: {error}");
            return;
        }
    };

    let _ = stream.set_write_timeout(Some(SOCKET_TIMEOUT));
    if let Err(error) = stream.write_all(response.to_http().as_bytes()) {
        eprintln!("write error: {error}");
    }
}

#[derive(Debug)]
enum ReadError {
    Rejected(u16, &'static str),
    Io(io::Error),
}

fn read_http_request(stream: &mut TcpStream) -> Result<String, ReadError> {
    stream
        .set_read_timeout(Some(SOCKET_TIMEOUT))
        .map_err(ReadError::Io)?;
    let deadline = Instant::now() + REQUEST_DEADLINE;
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];

    loop {
        if let Some(head_end) = find_head_end(&bytes) {
            let length = declared_content_length(&bytes[..head_end])?;
            if bytes.len() >= head_end + 4 + length {
                return assemble(&bytes, head_end, length);
            }
        } else if bytes.len() > MAX_HEADER_BYTES {
            return Err(ReadError::Rejected(431, "request headers are too large"));
        }

        if Instant::now() > deadline {
            return Err(ReadError::Rejected(400, "request timed out"));
        }
        let read = stream.read(&mut buffer).map_err(ReadError::Io)?;
        if read == 0 {
            return Err(ReadError::Rejected(400, "incomplete request"));
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
}

fn find_head_end(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn declared_content_length(head: &[u8]) -> Result<usize, ReadError> {
    let head = String::from_utf8_lossy(head);
    let mut length = 0;

    for line in head.lines().skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim();
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err(ReadError::Rejected(
                400,
                "transfer-encoding is not supported",
            ));
        }
        if name.eq_ignore_ascii_case("content-length") {
            length = value
                .trim()
                .parse::<usize>()
                .map_err(|_| ReadError::Rejected(400, "invalid content-length"))?;
        }
    }

    if length > MAX_BODY_BYTES {
        return Err(ReadError::Rejected(413, "request body is too large"));
    }
    Ok(length)
}

/// Keeps exactly `length` body bytes so trailing data is never parsed as body.
fn assemble(bytes: &[u8], head_end: usize, length: usize) -> Result<String, ReadError> {
    String::from_utf8(bytes[..head_end + 4 + length].to_vec())
        .map_err(|_| ReadError::Rejected(400, "request must be valid UTF-8"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_end_of_headers() {
        assert_eq!(
            find_head_end(b"GET / HTTP/1.1\r\nA: b\r\n\r\nbody"),
            Some(20)
        );
        assert_eq!(find_head_end(b"GET / HTTP/1.1\r\nA: b"), None);
    }

    #[test]
    fn rejects_oversized_or_invalid_content_length() {
        let big = format!("POST / HTTP/1.1\r\nContent-Length: {}", MAX_BODY_BYTES + 1);
        assert!(matches!(
            declared_content_length(big.as_bytes()),
            Err(ReadError::Rejected(413, _))
        ));
        assert!(matches!(
            declared_content_length(b"POST / HTTP/1.1\r\nContent-Length: abc"),
            Err(ReadError::Rejected(400, _))
        ));
        assert!(matches!(
            declared_content_length(b"POST / HTTP/1.1\r\nTransfer-Encoding: chunked"),
            Err(ReadError::Rejected(400, _))
        ));
        assert_eq!(
            declared_content_length(b"POST / HTTP/1.1\r\ncontent-length: 17").ok(),
            Some(17)
        );
    }

    #[test]
    fn truncates_trailing_bytes_after_declared_body() {
        let raw = b"POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}EXTRA";
        let end = find_head_end(raw).expect("head end");
        let request = assemble(raw, end, 2).expect("assembled");

        assert!(request.ends_with("\r\n\r\n{}"));
    }
}
