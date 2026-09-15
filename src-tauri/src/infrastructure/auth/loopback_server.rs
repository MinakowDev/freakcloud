use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tauri::{AppHandle, Emitter, Manager};
use crate::application::AppState;

pub const LOOPBACK_PORT: u16 = 49281;

pub async fn start_loopback_server(app: AppHandle) {
    let addr = format!("127.0.0.1:{}", LOOPBACK_PORT);
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[Loopback] Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    println!("[Loopback] Listening for browser auth on http://{}", addr);

    loop {
        let (mut socket, _) = match listener.accept().await {
            Ok(s) => s,
            Err(_) => continue,
        };

        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            let n = match socket.read(&mut buf).await {
                Ok(n) if n > 0 => n,
                _ => return,
            };

            let req_str = String::from_utf8_lossy(&buf[..n]);
            let first_line = req_str.lines().next().unwrap_or("");

            if first_line.starts_with("OPTIONS") {
                let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
                let _ = socket.write_all(resp.as_bytes()).await;
                return;
            }

            if first_line.starts_with("GET /login") {
                let mut token_opt = None;
                if let Some(idx) = first_line.find("?token=") {
                    let rest = &first_line[idx + 7..];
                    let end = rest.find(' ').or_else(|| rest.find('&')).unwrap_or(rest.len());
                    let raw_token = &rest[..end];
                    token_opt = Some(url_decode(raw_token));
                }

                if let Some(token) = token_opt {
                    let clean_token = token.trim();
                    if !clean_token.is_empty() {
                        if let Some(state) = app_handle.try_state::<AppState>() {
                            let _ = state.authenticate.login_with_token(clean_token).await;
                            let _ = app_handle.emit("session_updated", ());
                        }

                        let html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>freackcloud</title>
  <style>
    body { background: #000000; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; background: #09090b; padding: 36px 48px; border-radius: 16px; border: 1px solid #27272a; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); max-width: 380px; }
    h1 { font-size: 22px; margin: 0 0 10px 0; font-weight: 600; color: #ffffff; }
    p { color: #a1a1aa; font-size: 14px; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✓ Успешно!</h1>
    <p>Авторизация передана в freackcloud. Можете закрыть эту вкладку.</p>
    <script>setTimeout(function() { window.close(); }, 2500);</script>
  </div>
</body>
</html>"#;

                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = socket.write_all(resp.as_bytes()).await;
                        return;
                    }
                }
            }

            let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = socket.write_all(not_found.as_bytes()).await;
        });
    }
}

fn url_decode(s: &str) -> String {
    let mut res = String::new();
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h1, h2), 16) {
                res.push(byte as char);
            }
        } else if c == '+' {
            res.push(' ');
        } else {
            res.push(c);
        }
    }
    res
}
