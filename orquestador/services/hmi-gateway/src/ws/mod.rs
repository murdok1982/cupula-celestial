//! WebSocket bridge para HMI Operador.
//!
//! Endpoint: `ws(s)://hmi-gateway:8080/ws`.
//!
//! Autenticación:
//! - Vía query string `?token=<JWT>` (compat con cliente legacy).
//! - Vía header `Sec-WebSocket-Protocol: bearer.<JWT>` (H-MED-002 recomendado).
//!
//! Validación de origen (H-MED-007):
//! - Header `Origin` debe estar en `ALLOWED_ORIGINS`.
//!
//! Mensajes salida: tracks confirmados, recomendaciones, alertas (JSON).
//! Mensajes entrada: pings, suscripciones simples.

use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Query, State, WebSocketUpgrade};
use axum::http::HeaderMap;
use axum::response::Response;
use serde::Deserialize;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use crate::auth::JwtKeys;

#[derive(Clone)]
pub struct WsHub {
    pub tx: broadcast::Sender<String>,
    pub jwt: Arc<JwtKeys>,
}

impl WsHub {
    pub fn new(jwt: Arc<JwtKeys>) -> Self {
        let (tx, _rx) = broadcast::channel::<String>(1024);
        Self { tx, jwt }
    }

    pub fn publish(&self, msg: String) {
        let _ = self.tx.send(msg);
    }
}

#[derive(Debug, Deserialize)]
pub struct WsParams {
    pub token: Option<String>,
}

fn token_from_subprotocol(h: &HeaderMap) -> Option<String> {
    let raw = h.get("sec-websocket-protocol")?.to_str().ok()?;
    for part in raw.split(',') {
        let p = part.trim();
        if let Some(t) = p.strip_prefix("bearer.") {
            return Some(t.to_string());
        }
    }
    None
}

fn origin_allowed(h: &HeaderMap) -> bool {
    let origin = match h.get("origin").and_then(|v| v.to_str().ok()) {
        Some(o) => o,
        None => return true, // sin Origin (clientes no-browser, tests)
    };
    let allowed = std::env::var("ALLOWED_ORIGINS").unwrap_or_default();
    allowed.split(',').any(|o| o.trim() == origin)
}

pub async fn upgrade(
    ws: WebSocketUpgrade,
    State(hub): State<WsHub>,
    Query(params): Query<WsParams>,
    headers: HeaderMap,
) -> Response {
    // H-MED-007: validación Origin allowlist
    if !origin_allowed(&headers) {
        warn!("ws upgrade rechazado: Origin no permitido");
        return axum::http::Response::builder()
            .status(axum::http::StatusCode::FORBIDDEN)
            .body(axum::body::Body::from("origin not allowed"))
            .unwrap();
    }

    // Token: query OR header subprotocol
    let token_str = params.token.clone().or_else(|| token_from_subprotocol(&headers));
    let claims = match token_str.as_deref() {
        Some(t) => match hub.jwt.verify(t) {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "ws auth rechazada");
                return axum::http::Response::builder()
                    .status(axum::http::StatusCode::UNAUTHORIZED)
                    .body(axum::body::Body::from("invalid token"))
                    .unwrap();
            }
        },
        None => {
            return axum::http::Response::builder()
                .status(axum::http::StatusCode::UNAUTHORIZED)
                .body(axum::body::Body::from("missing token"))
                .unwrap();
        }
    };
    info!(user = %claims.sub, role = %claims.role, "ws cliente autenticado");
    ws.on_upgrade(move |socket| handle_socket(socket, hub, claims.sub))
}

async fn handle_socket(socket: WebSocket, hub: WsHub, user_id: String) {
    let (mut sender, mut receiver) = socket.split();
    use futures::SinkExt;
    use futures::StreamExt;
    let mut rx = hub.tx.subscribe();

    // Tarea: reenviar al cliente todo lo publicado en el hub
    let user_id_send = user_id.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg)).await.is_err() {
                debug!(user = %user_id_send, "ws cliente desconectado");
                break;
            }
        }
    });

    // Tarea: leer pings/control del cliente
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(t) => debug!(user = %user_id, "ws msg in: {t}"),
                Message::Ping(_) | Message::Pong(_) => {}
                Message::Close(_) => break,
                Message::Binary(_) => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}
