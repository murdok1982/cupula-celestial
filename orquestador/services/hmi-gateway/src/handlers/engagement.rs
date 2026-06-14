use axum::{
    extract::{ConnectInfo, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rdkafka::producer::{FutureRecord, Producer};
use serde::Deserialize;
use tracing::{info, warn};

use crate::auth::{self, sessions};
use crate::authz::{required_rank, role_rank};
use crate::metrics;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthorizeReq {
    pub recommendation_id: String,
    pub track_id: String,
    pub interceptors: Vec<String>,
    pub target_lat: f64,
    pub target_lon: f64,
    pub target_alt_m: f64,
    pub operator_id: String,
    pub mfa_proof: String,
    pub bearer_token: String,
    #[serde(default)]
    pub authorization_level: Option<String>,
}

pub async fn authorize(
    State(state): State<AppState>,
    ConnectInfo(remote): ConnectInfo<std::net::SocketAddr>,
    Json(req): Json<AuthorizeReq>,
) -> axum::response::Response {
    let claims = match state.jwt.verify(&req.bearer_token) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };
    if !claims.mfa_satisfied {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "MFA no satisfecho"})),
        )
            .into_response();
    }
    if let Some(redis) = &state.redis {
        if sessions::is_jti_blacklisted(redis, &claims.jti).await {
            metrics::metrics().jwt_blacklist_hits.with_label_values(&[]).inc();
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"token revocado"}))).into_response();
        }
    }

    if let Some(redis) = &state.redis {
        if !sessions::consume_mfa_proof(redis, &claims.sub, &req.mfa_proof).await {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "mfa_proof inválido o caducado"})),
            )
                .into_response();
        }
    } else if req.mfa_proof.len() < 64 || hex::decode(&req.mfa_proof).is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "mfa_proof formato inválido"})),
        )
            .into_response();
    }

    let required_level = req
        .authorization_level
        .as_deref()
        .unwrap_or("OFICIAL_TACTICO");
    let op_rank = role_rank(&claims.role);
    let req_rank = required_rank(required_level);
    if op_rank < req_rank {
        warn!(
            user = %claims.sub,
            role = %claims.role,
            required = %required_level,
            "intento de autorización con rol insuficiente"
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "rol insuficiente",
                "operator_rank": op_rank,
                "required_rank": req_rank,
                "required_level": required_level
            })),
        )
            .into_response();
    }

    if let Err(e) = verify_recommendation_exists(&state.audit_log_url, &req.recommendation_id).await {
        warn!(rec_id = %req.recommendation_id, error = %e, "rec_id no consta en audit-log");
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "recommendation_id no consta en audit-log",
                "detail": e
            })),
        )
            .into_response();
    }

    let event = serde_json::json!({
        "recommendation_id": req.recommendation_id,
        "track_id": req.track_id,
        "interceptors": req.interceptors,
        "target_lat": req.target_lat,
        "target_lon": req.target_lon,
        "target_alt_m": req.target_alt_m,
        "operator_id": req.operator_id,
        "operator_remote_ip": remote.ip().to_string(),
        "authorization_level": required_level,
    });
    let payload = event.to_string();
    if let Some(p) = &state.producer {
        let rec = FutureRecord::to("engagement.authorized")
            .key(&req.recommendation_id)
            .payload(payload.as_bytes());
        if let Err((e, _)) = p.send(rec, std::time::Duration::from_secs(5)).await {
            warn!(error = %e, "no se pudo publicar engagement.authorized");
        }
    }
    info!(rec = %req.recommendation_id, user = %req.operator_id, "engagement autorizado");
    metrics::metrics()
        .engagement_authorize
        .with_label_values(&["authorized"])
        .inc();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "authorized": true,
            "recommendation_id": req.recommendation_id,
            "publish_topic": "engagement.authorized"
        })),
    )
        .into_response()
}

async fn verify_recommendation_exists(audit_url: &str, recommendation_id: &str) -> Result<(), String> {
    let url = format!("{audit_url}/v1/events?event_type=RECOMMENDATIONS&limit=500");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("audit-log respondió {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let events = body
        .get("events")
        .and_then(|v| v.as_array())
        .ok_or("audit-log respuesta inesperada")?;
    let found = events.iter().any(|e| {
        e.get("payload")
            .and_then(|p| p.get("recommendation_id"))
            .and_then(|v| v.as_str())
            == Some(recommendation_id)
    });
    if found {
        Ok(())
    } else {
        Err("recommendation_id no encontrado".into())
    }
}
