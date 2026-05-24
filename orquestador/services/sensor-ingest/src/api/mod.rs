//! API HTTP de sensor-ingest.
//!
//! Endpoints sensibles requieren autenticación HMAC por sensor — ver `auth`.

use axum::{
    extract::State,
    http::{HeaderName, HeaderValue, Method, StatusCode},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

use std::sync::Arc;

use crate::auth::{require_sensor_auth, SensorAuth};
use crate::models::SensorReading;
use crate::AppState;

pub fn router(state: AppState) -> Router {
    let allowed_origins_env =
        std::env::var("ALLOWED_ORIGINS").unwrap_or_else(|_| "http://localhost:5173".into());
    let allowed_origins: Vec<HeaderValue> = allowed_origins_env
        .split(',')
        .filter_map(|o| o.trim().parse::<HeaderValue>().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            HeaderName::from_static("x-sensor-auth"),
        ])
        .allow_origin(allowed_origins);

    // Rate limiting (H-ALT-004): 10000 req/min/IP ≈ 167 req/s burst
    let governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(167)
            .burst_size(500)
            .finish()
            .expect("sensor governor"),
    );

    let protected = Router::new()
        .route("/v1/sensors/reading", post(ingest))
        .route("/v1/sensors/batch", post(ingest_batch))
        .layer(middleware::from_fn_with_state(
            state.sensor_auth.clone(),
            require_sensor_auth,
        ))
        .layer(GovernorLayer { config: governor })
        .with_state(state.clone());

    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .merge(protected)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> impl IntoResponse {
    Json(Health {
        status: "ok",
        service: "sensor-ingest",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn ready() -> impl IntoResponse {
    (StatusCode::OK, "ready")
}

#[derive(Serialize)]
struct IngestAck {
    accepted: usize,
    sensor_id: String,
}

async fn ingest(
    State(state): State<AppState>,
    Json(reading): Json<SensorReading>,
) -> impl IntoResponse {
    if let Err(err) = reading.validate() {
        warn!(error = err, "lectura sensor inválida");
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": err})))
            .into_response();
    }

    let payload = match serde_json::to_vec(&reading) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("serialize: {e}")})),
            )
                .into_response()
        }
    };

    if let Err(e) = state
        .producer
        .publish("sensors.raw", &reading.sensor_id, &payload)
        .await
    {
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": format!("kafka: {e}")})),
        )
            .into_response();
    }

    info!(sensor_id = %reading.sensor_id, "lectura publicada");
    (
        StatusCode::ACCEPTED,
        Json(IngestAck {
            accepted: 1,
            sensor_id: reading.sensor_id,
        }),
    )
        .into_response()
}

async fn ingest_batch(
    State(state): State<AppState>,
    Json(batch): Json<Vec<SensorReading>>,
) -> impl IntoResponse {
    let mut accepted = 0usize;
    let mut rejected = Vec::new();

    for reading in batch {
        if let Err(err) = reading.validate() {
            rejected.push(serde_json::json!({"sensor_id": reading.sensor_id, "reason": err}));
            continue;
        }
        let payload = match serde_json::to_vec(&reading) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if state
            .producer
            .publish("sensors.raw", &reading.sensor_id, &payload)
            .await
            .is_ok()
        {
            accepted += 1;
        } else {
            rejected.push(serde_json::json!({"sensor_id": reading.sensor_id, "reason": "kafka"}));
        }
    }

    (
        StatusCode::ACCEPTED,
        Json(serde_json::json!({"accepted": accepted, "rejected": rejected})),
    )
        .into_response()
}
