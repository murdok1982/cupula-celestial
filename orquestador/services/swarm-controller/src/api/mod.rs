//! API HTTP del swarm-controller: recibe órdenes desde HMI gateway o tests e2e.
//!
//! Todos los endpoints de `command/*` y `wta/assign` requieren autenticación
//! inter-servicio (HMAC-SHA256 o JWT RS256 — ver `auth::require_internal_auth`).

use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

use crate::allocator::{assign, Assignment, Interceptor, Target};
use crate::auth::{require_internal_auth, verify_engagement_in_audit, InternalAuth};
use crate::mavlink_send::MavlinkClient;

#[derive(Clone)]
pub struct AppState {
    pub mavlink: Arc<MavlinkClient>,
    pub internal_auth: InternalAuth,
    pub audit_log_url: String,
}

pub fn router(state: AppState) -> Router {
    // Rutas protegidas con middleware HMAC/JWT (state inyectado vía clousure)
    let auth = state.internal_auth.clone();
    let protected = Router::new()
        .route("/v1/wta/assign", post(do_assign))
        .route("/v1/command/engage", post(command_engage))
        .route("/v1/command/abort", post(command_abort))
        .layer(middleware::from_fn_with_state(auth, require_internal_auth))
        .with_state(state);

    Router::new()
        .route("/health", get(health))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
}

async fn health() -> impl IntoResponse {
    Json(Health {
        status: "ok",
        service: "swarm-controller",
    })
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AssignRequest {
    pub targets: Vec<Target>,
    pub interceptors: Vec<Interceptor>,
}

#[derive(Debug, Serialize)]
pub struct AssignResponse {
    pub assignments: Vec<Assignment>,
    pub algorithm: &'static str,
}

async fn do_assign(Json(req): Json<AssignRequest>) -> impl IntoResponse {
    let algo = if req.targets.len() * req.interceptors.len() <= 32 * 64 {
        "hungarian"
    } else {
        "greedy_by_tti"
    };
    let res = assign(&req.targets, &req.interceptors);
    info!(targets = req.targets.len(), interceptors = req.interceptors.len(), assigned = res.len(), "WTA");
    (
        StatusCode::OK,
        Json(AssignResponse {
            assignments: res,
            algorithm: algo,
        }),
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EngageRequest {
    pub interceptor_id: String,
    pub mavlink_system_id: u8,
    pub mavlink_component_id: u8,
    pub target_lat: f64,
    pub target_lon: f64,
    pub target_alt_m: f64,
    /// Identificador de la autorización (rec_id) — debe constar en audit-log.
    pub authorization_id: String,
}

#[derive(Debug, Serialize)]
pub struct EngageResponse {
    pub commanded: bool,
    pub command_id: String,
    pub interceptor_id: String,
}

/// Valida coordenadas (H-BAJ-006): lat ∈ [-90,90], lon ∈ [-180,180], alt ≥ 0.
fn validate_coords(lat: f64, lon: f64, alt: f64) -> Result<(), String> {
    if !(-90.0..=90.0).contains(&lat) {
        return Err(format!("lat fuera de rango: {lat}"));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(format!("lon fuera de rango: {lon}"));
    }
    if !lat.is_finite() || !lon.is_finite() || !alt.is_finite() {
        return Err("coordenada no finita".into());
    }
    if alt < 0.0 {
        return Err(format!("alt negativa: {alt}"));
    }
    Ok(())
}

async fn command_engage(
    State(state): State<AppState>,
    Json(req): Json<EngageRequest>,
) -> impl IntoResponse {
    info!(?req, "engagement command in");

    // Validar coordenadas (H-BAJ-006)
    if let Err(e) = validate_coords(req.target_lat, req.target_lon, req.target_alt_m) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": e})),
        )
            .into_response();
    }

    // Validar que la autorización existe en audit-log (H-CRIT-001)
    if !verify_engagement_in_audit(&state.audit_log_url, &req.authorization_id).await {
        warn!(rec_id = %req.authorization_id, "authorization_id no consta en audit-log");
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "authorization_id no consta en audit-log",
                "authorization_id": req.authorization_id
            })),
        )
            .into_response();
    }

    let res = state.mavlink.send_engage_waypoint(
        req.mavlink_system_id,
        req.mavlink_component_id,
        req.target_lat,
        req.target_lon,
        req.target_alt_m as f32,
    );
    match res {
        Ok(()) => {
            let cmd_id = uuid::Uuid::new_v4().to_string();
            (
                StatusCode::OK,
                Json(EngageResponse {
                    commanded: true,
                    command_id: cmd_id,
                    interceptor_id: req.interceptor_id,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": e})),
        )
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AbortRequest {
    pub interceptor_id: String,
    pub mavlink_system_id: u8,
    pub reason: String,
}

async fn command_abort(
    State(state): State<AppState>,
    Json(req): Json<AbortRequest>,
) -> impl IntoResponse {
    info!(?req, "ABORT command in");
    match state.mavlink.send_abort(req.mavlink_system_id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({"aborted": true}))).into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": e})),
        )
            .into_response(),
    }
}
