//! Métricas Prometheus para hmi-gateway.
//!
//! FASE 2 — H-MED-additional: exposición de métricas operativas.
//! - `cupula_login_attempts_total{result}` — login attempts contador.
//! - `cupula_engagement_authorize_total{result}` — autorizaciones.
//! - `cupula_rate_limit_hits_total{endpoint}` — req bloqueadas.
//! - `cupula_jwt_blacklist_hits_total` — JWT rechazados por blacklist.
//! - `cupula_webauthn_outcomes_total{outcome}` — resultados FIDO2.

use std::sync::OnceLock;

use axum::http::StatusCode;
use axum::response::IntoResponse;
use prometheus::{
    Encoder, IntCounterVec, Opts, Registry, TextEncoder,
};

pub struct Metrics {
    pub registry: Registry,
    pub login_attempts: IntCounterVec,
    pub engagement_authorize: IntCounterVec,
    pub rate_limit_hits: IntCounterVec,
    pub jwt_blacklist_hits: IntCounterVec,
    pub webauthn_outcomes: IntCounterVec,
}

static METRICS: OnceLock<Metrics> = OnceLock::new();

pub fn metrics() -> &'static Metrics {
    METRICS.get_or_init(|| {
        let registry = Registry::new();

        let login_attempts = IntCounterVec::new(
            Opts::new("cupula_login_attempts_total", "Login attempts grouped by result"),
            &["result"],
        )
        .expect("create login_attempts");
        let engagement_authorize = IntCounterVec::new(
            Opts::new(
                "cupula_engagement_authorize_total",
                "Engagement authorization outcomes",
            ),
            &["result"],
        )
        .expect("create engagement_authorize");
        let rate_limit_hits = IntCounterVec::new(
            Opts::new(
                "cupula_rate_limit_hits_total",
                "Requests blocked by rate limiter",
            ),
            &["endpoint"],
        )
        .expect("create rate_limit_hits");
        let jwt_blacklist_hits = IntCounterVec::new(
            Opts::new(
                "cupula_jwt_blacklist_hits_total",
                "JWT rejected because jti is blacklisted",
            ),
            &[],
        )
        .expect("create jwt_blacklist_hits");
        let webauthn_outcomes = IntCounterVec::new(
            Opts::new(
                "cupula_webauthn_outcomes_total",
                "FIDO2/WebAuthn verification outcomes",
            ),
            &["outcome"],
        )
        .expect("create webauthn_outcomes");

        registry.register(Box::new(login_attempts.clone())).ok();
        registry.register(Box::new(engagement_authorize.clone())).ok();
        registry.register(Box::new(rate_limit_hits.clone())).ok();
        registry.register(Box::new(jwt_blacklist_hits.clone())).ok();
        registry.register(Box::new(webauthn_outcomes.clone())).ok();

        Metrics {
            registry,
            login_attempts,
            engagement_authorize,
            rate_limit_hits,
            jwt_blacklist_hits,
            webauthn_outcomes,
        }
    })
}

/// Handler axum para `GET /metrics`.
pub async fn handler() -> impl IntoResponse {
    let m = metrics();
    let mut buf = Vec::new();
    let encoder = TextEncoder::new();
    let gathered = m.registry.gather();
    if encoder.encode(&gathered, &mut buf).is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "encode error").into_response();
    }
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        buf,
    )
        .into_response()
}
