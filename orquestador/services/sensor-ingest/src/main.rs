//! sensor-ingest: punto de entrada de detecciones multisensor.
//!
//! Acepta detecciones por HTTP (POST /v1/sensors/reading) y las publica al
//! topic Kafka `sensors.raw` con clave = sensor_id para preservar orden.
//!
//! Seguridad (H-ALT-002):
//!  - HMAC-SHA256 obligatorio por sensor (header `X-Sensor-Auth`).
//!  - Anti-replay con nonce en Redis (TTL 30s).
//!  - Tolerancia temporal ±30s.

mod api;
mod auth;
mod kafka;
mod models;
#[allow(dead_code)]
mod proto;
#[cfg(test)]
mod tests;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use axum::Router;
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use crate::auth::SensorAuth;

#[derive(Clone)]
pub struct AppState {
    pub producer: Arc<kafka::Producer>,
    pub sensor_auth: SensorAuth,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let bind: SocketAddr = std::env::var("SENSOR_INGEST_BIND")
        .unwrap_or_else(|_| "0.0.0.0:9000".to_string())
        .parse()
        .context("SENSOR_INGEST_BIND inválido")?;

    let brokers =
        std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "redpanda:9092".to_string());

    let producer = match kafka::Producer::new(&brokers, "sensor-ingest") {
        Ok(p) => Arc::new(p),
        Err(e) => {
            warn!(error = %e, "no se pudo conectar a Kafka; arrancando en modo degradado (logs locales)");
            Arc::new(kafka::Producer::degraded())
        }
    };

    let redis: Option<Arc<redis::Client>> = std::env::var("REDIS_URL")
        .ok()
        .and_then(|u| redis::Client::open(u).ok())
        .map(Arc::new);
    if redis.is_none() {
        warn!("REDIS_URL no disponible; anti-replay degradado");
    }

    let sensor_auth = SensorAuth::from_env(redis);

    let state = AppState { producer, sensor_auth };

    let app: Router = api::router(state);

    info!(%bind, "sensor-ingest listening (HMAC enforced)");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,sensor_ingest=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("no CTRL+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("no SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
    info!("shutdown signal received");
}
