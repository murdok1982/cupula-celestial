//! Autenticación HMAC para sensores físicos (H-ALT-002).
//!
//! Cada sensor tiene una clave HMAC simétrica asignada (almacenada en
//! `SENSOR_HMAC_KEYS` como JSON `{"radar01":"...","ir01":"..."}`).
//!
//! Header obligatorio: `X-Sensor-Auth: <sensor_id>:<timestamp_unix>:<nonce>:<hmac_hex>`
//!
//! El HMAC se computa así:
//!   hmac_sha256(key, "<sensor_id>\n<timestamp>\n<nonce>\n<body_sha256_hex>")
//!
//! Anti-replay:
//! - `timestamp` debe estar dentro de ±30s del reloj del servidor.
//! - El par `(sensor_id, nonce)` se guarda en Redis con TTL 60s. Si ya existe → reject.
//!
//! En modo degradado (sin Redis o sin keys configuradas), si `SENSOR_HMAC_REQUIRED=false`
//! permite paso pero registra un warn. Por defecto `SENSOR_HMAC_REQUIRED=true` en prod.

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    body::{Body, Bytes},
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tracing::{debug, warn};

type HmacSha256 = Hmac<Sha256>;

pub const TIMESTAMP_TOLERANCE_SECONDS: i64 = 30;
pub const REPLAY_CACHE_TTL_SECONDS: usize = 60;

#[derive(Clone)]
pub struct SensorAuth {
    pub keys: Arc<HashMap<String, Vec<u8>>>,
    pub redis: Option<Arc<redis::Client>>,
    pub required: bool,
}

impl SensorAuth {
    pub fn from_env(redis: Option<Arc<redis::Client>>) -> Self {
        let raw = std::env::var("SENSOR_HMAC_KEYS").unwrap_or_default();
        let map: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
        let keys: HashMap<String, Vec<u8>> =
            map.into_iter().map(|(k, v)| (k, v.into_bytes())).collect();
        let required = std::env::var("SENSOR_HMAC_REQUIRED")
            .map(|s| !matches!(s.to_ascii_lowercase().as_str(), "0" | "false" | "no" | "off"))
            .unwrap_or(true);
        if keys.is_empty() {
            warn!("SENSOR_HMAC_KEYS vacía — sensor-ingest correrá en modo degradado");
        }
        Self {
            keys: Arc::new(keys),
            redis,
            required,
        }
    }

    pub fn key_for(&self, sensor_id: &str) -> Option<&Vec<u8>> {
        self.keys.get(sensor_id)
    }
}

#[derive(Debug)]
struct ParsedHeader<'a> {
    sensor_id: &'a str,
    timestamp: i64,
    nonce: &'a str,
    hmac_hex: &'a str,
}

fn parse_header(h: &str) -> Option<ParsedHeader<'_>> {
    let parts: Vec<&str> = h.splitn(4, ':').collect();
    if parts.len() != 4 {
        return None;
    }
    let ts: i64 = parts[1].parse().ok()?;
    Some(ParsedHeader {
        sensor_id: parts[0],
        timestamp: ts,
        nonce: parts[2],
        hmac_hex: parts[3],
    })
}

fn hash_hex(b: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(b);
    hex::encode(h.finalize())
}

fn now_unix() -> i64 {
    chrono::Utc::now().timestamp()
}

async fn check_replay(
    redis: &Option<Arc<redis::Client>>,
    sensor_id: &str,
    nonce: &str,
) -> Result<(), &'static str> {
    let client = match redis {
        Some(r) => r,
        None => {
            debug!("redis ausente; saltando anti-replay (PoC degradado)");
            return Ok(());
        }
    };
    let mut conn = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(_) => return Ok(()), // fallo redis: degradado
    };
    let key = format!("sensor:nonce:{}:{}", sensor_id, nonce);
    // SET key 1 NX EX 60 → si ya existía, devuelve nil
    let res: redis::RedisResult<Option<String>> = redis::cmd("SET")
        .arg(&key)
        .arg("1")
        .arg("NX")
        .arg("EX")
        .arg(REPLAY_CACHE_TTL_SECONDS)
        .query_async(&mut conn)
        .await;
    match res {
        Ok(Some(_)) => Ok(()),
        Ok(None) => Err("replay"),
        Err(_) => Ok(()), // fallo Redis → no bloqueamos
    }
}

pub async fn require_sensor_auth(
    State(auth): State<SensorAuth>,
    req: Request,
    next: Next,
) -> Response {
    let (parts, body) = req.into_parts();
    let bytes: Bytes = match body.collect().await {
        Ok(c) => c.to_bytes(),
        Err(_) => return (StatusCode::BAD_REQUEST, "body").into_response(),
    };

    let hdr = parts.headers.get("x-sensor-auth").and_then(|v| v.to_str().ok());
    let Some(hdr) = hdr else {
        if auth.required {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({"error": "x-sensor-auth requerido"})),
            )
                .into_response();
        }
        let req = Request::from_parts(parts, Body::from(bytes));
        return next.run(req).await;
    };

    let parsed = match parse_header(hdr) {
        Some(p) => p,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                axum::Json(serde_json::json!({"error": "x-sensor-auth malformado"})),
            )
                .into_response()
        }
    };

    // Tolerancia temporal
    let now = now_unix();
    if (now - parsed.timestamp).abs() > TIMESTAMP_TOLERANCE_SECONDS {
        warn!(
            sensor = parsed.sensor_id,
            ts = parsed.timestamp,
            now,
            "rechazado: timestamp fuera de tolerancia"
        );
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"error": "timestamp fuera de tolerancia"})),
        )
            .into_response();
    }

    let key = match auth.key_for(parsed.sensor_id) {
        Some(k) => k,
        None => {
            warn!(sensor = parsed.sensor_id, "sensor desconocido");
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({"error": "sensor desconocido"})),
            )
                .into_response();
        }
    };

    let body_hash = hash_hex(&bytes);
    let signed_payload = format!(
        "{}\n{}\n{}\n{}",
        parsed.sensor_id, parsed.timestamp, parsed.nonce, body_hash
    );
    let mut mac = match HmacSha256::new_from_slice(key) {
        Ok(m) => m,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "hmac init").into_response(),
    };
    mac.update(signed_payload.as_bytes());
    let provided = match hex::decode(parsed.hmac_hex) {
        Ok(b) => b,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({"error": "hmac hex inválido"})),
            )
                .into_response()
        }
    };
    if mac.verify_slice(&provided).is_err() {
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"error": "hmac no coincide"})),
        )
            .into_response();
    }

    // Anti-replay (nonce single-use TTL 60s)
    if let Err(e) = check_replay(&auth.redis, parsed.sensor_id, parsed.nonce).await {
        warn!(sensor = parsed.sensor_id, nonce = parsed.nonce, "replay detectado");
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"error": e})),
        )
            .into_response();
    }

    let req = Request::from_parts(parts, Body::from(bytes));
    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Method, Request, StatusCode},
        routing::post,
        Router,
    };
    use tower::ServiceExt;

    #[test]
    fn parse_header_ok() {
        let p = parse_header("radar01:1700000000:abc:deadbeef").unwrap();
        assert_eq!(p.sensor_id, "radar01");
        assert_eq!(p.timestamp, 1700000000);
        assert_eq!(p.nonce, "abc");
        assert_eq!(p.hmac_hex, "deadbeef");
    }

    #[test]
    fn parse_header_bad() {
        assert!(parse_header("nope").is_none());
        assert!(parse_header("a:b:c").is_none());
    }

    fn build_app(required: bool, keys_json: &str) -> Router {
        std::env::set_var("SENSOR_HMAC_KEYS", keys_json);
        std::env::set_var(
            "SENSOR_HMAC_REQUIRED",
            if required { "true" } else { "false" },
        );
        let auth = SensorAuth::from_env(None);
        Router::new()
            .route("/v1/sensors/reading", post(|| async { "ok" }))
            .layer(axum::middleware::from_fn_with_state(
                auth,
                require_sensor_auth,
            ))
    }

    #[tokio::test]
    async fn rejects_without_header() {
        let app = build_app(true, r#"{"radar01":"key"}"#);
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .body(Body::from(""))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_unknown_sensor() {
        let app = build_app(true, r#"{"known":"key"}"#);
        let ts = chrono::Utc::now().timestamp();
        let hdr = format!("unknown_sensor:{ts}:nonce:deadbeef");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(""))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_old_timestamp() {
        let app = build_app(true, r#"{"radar01":"key"}"#);
        let ts = chrono::Utc::now().timestamp() - 600; // 10 min atrás
        let hdr = format!("radar01:{ts}:nonce:deadbeef");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(""))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}
