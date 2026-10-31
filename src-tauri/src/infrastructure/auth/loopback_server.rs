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
            log::error!("[Loopback] Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    log::info!("[Loopback] Listening for browser auth on http://{}", addr);

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

            if first_line.starts_with("GET /status") || first_line.starts_with("GET /ping") {
                let mut is_auth = false;
                let mut username_val = None;

                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(sess) = state.authenticate.get_current_session().await {
                        is_auth = sess.is_authenticated;
                        username_val = sess.user.map(|u| u.username);
                    }
                }

                let username_json = match username_val {
                    Some(u) => format!("\"{}\"", u.replace('\\', "\\\\").replace('"', "\\\"")),
                    None => "null".to_string(),
                };

                let json = format!(
                    "{{\"status\":\"ok\",\"app\":\"freakcloud\",\"authenticated\":{},\"username\":{}}}",
                    is_auth, username_json
                );

                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n{}",
                    json.len(),
                    json
                );
                let _ = socket.write_all(resp.as_bytes()).await;
                return;
            }

            if first_line.starts_with("GET /login") {
                let mut token_opt = None;
                let mut client_id_opt = None;

                // Extract query string: between '?' and first space (or end of line)
                if let Some(q_idx) = first_line.find('?') {
                    let after_q = &first_line[q_idx + 1..];
                    let query_str = match after_q.find(' ') {
                        Some(s_idx) => &after_q[..s_idx],
                        None => after_q,
                    };

                    for pair in query_str.split('&') {
                        let mut parts = pair.splitn(2, '=');
                        let key = parts.next().unwrap_or("");
                        let val = parts.next().unwrap_or("");
                        if key == "token" {
                            let decoded = url_decode(val);
                            let clean = decoded.trim();
                            if !clean.is_empty() {
                                token_opt = Some(clean.to_string());
                            }
                        } else if key == "client_id" {
                            let decoded = url_decode(val);
                            let clean = decoded.trim();
                            if !clean.is_empty() {
                                client_id_opt = Some(clean.to_string());
                            }
                        }
                    }
                } else if let Some(idx) = first_line.find("token=") {
                    // Fallback for paths like /login/token=XYZ
                    let rest = &first_line[idx + 6..];
                    let end = [rest.find(' '), rest.find('&'), rest.find('#')]
                        .into_iter()
                        .flatten()
                        .min()
                        .unwrap_or(rest.len());
                    let raw_token = &rest[..end];
                    let decoded = url_decode(raw_token);
                    let clean = decoded.trim();
                    if !clean.is_empty() {
                        token_opt = Some(clean.to_string());
                    }
                }

                if let Some(token) = token_opt {
                    let clean_token = token.trim();
                    if !clean_token.is_empty() {
                        let mut login_ok = false;
                        let mut username_opt = None;

                        if let Some(state) = app_handle.try_state::<AppState>() {
                            let prefix_len = clean_token.len().min(8);
                            log::info!(
                                "[Loopback] Attempting login with token: {}..., client_id: {:?}",
                                &clean_token[..prefix_len],
                                client_id_opt
                            );
                            match state.authenticate.login_with_token_and_client_id(clean_token, client_id_opt.as_deref()).await {
                                Ok(sess) => {
                                    login_ok = true;
                                    username_opt = sess.user.map(|u| u.username);
                                    let _ = app_handle.emit("session_updated", ());
                                }
                                Err(err) => {
                                    log::warn!("[Loopback] Login failed: {:?}", err);
                                }
                            }
                        }

                        let wants_json = req_str.contains("application/json")
                            || first_line.contains("&format=json")
                            || first_line.contains("?format=json");

                        if login_ok {
                            if wants_json {
                                let u_str = username_opt.as_deref().unwrap_or("");
                                let json = format!(
                                    "{{\"status\":\"ok\",\"authenticated\":true,\"username\":\"{}\"}}",
                                    u_str.replace('\\', "\\\\").replace('"', "\\\"")
                                );
                                let resp = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n{}",
                                    json.len(),
                                    json
                                );
                                let _ = socket.write_all(resp.as_bytes()).await;
                                return;
                            }

                            let html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>freakcloud</title>
  <style>
    body { background: #000000; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; background: #080808; padding: 36px 48px; border-radius: 8px; border: 1px solid #1a1a1a; max-width: 380px; }
    h1 { font-size: 20px; margin: 0 0 10px 0; font-weight: 600; color: #ffffff; }
    p { color: #8e8e93; font-size: 13px; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <h1>✓ Успешно!</h1>
    <p>Авторизация передана в freakcloud. Можете закрыть эту вкладку.</p>
    <script>setTimeout(function() { window.close(); }, 2000);</script>
  </div>
</body>
</html>"#;

                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n{}",
                                html.len(),
                                html
                            );
                            let _ = socket.write_all(resp.as_bytes()).await;
                            return;
                        } else {
                            let json = "{\"status\":\"error\",\"message\":\"invalid_token\"}";
                            let resp = format!(
                                "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = socket.write_all(resp.as_bytes()).await;
                            return;
                        }
                    }
                }
            }

            let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
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
