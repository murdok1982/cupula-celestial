//! Tests de la autenticación inter-servicio del swarm-controller (H-CRIT-001).
//!
//! Verifica que `/v1/command/engage` rechaza POSTs sin HMAC/JWT válido.

use std::sync::Arc;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use tower::ServiceExt; // for `oneshot`

use swarm_controller::api::{self, AppState};
use swarm_controller::auth::InternalAuth;
use swarm_controller::mavlink_send::MavlinkClient;

type HmacSha256 = Hmac<Sha256>;

fn build_app(hmac_key: Option<&str>) -> Router {
    if let Some(k) = hmac_key {
        std::env::set_var("INTERNAL_SVC_HMAC_KEY", k);
    } else {
        std::env::remove_var("INTERNAL_SVC_HMAC_KEY");
    }
    std::env::remove_var("JWT_PUBLIC_KEY_PATH");
    let auth = InternalAuth::from_env();
    let state = AppState {
        mavlink: Arc::new(MavlinkClient::new("127.0.0.1:0")),
        internal_auth: auth,
        audit_log_url: "http://127.0.0.1:1".into(), // unreachable on purpose
    };
    api::router(state)
}

fn sign(key: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).unwrap();
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

#[tokio::test]
async fn engage_rejects_without_internal_auth() {
    let app = build_app(Some("test_key_12345"));
    let body = serde_json::json!({
        "interceptor_id": "I-01",
        "mavlink_system_id": 1,
        "mavlink_component_id": 1,
        "target_lat": 40.0,
        "target_lon": -3.0,
        "target_alt_m": 100.0,
        "authorization_id": "rec-1"
    })
    .to_string();
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/command/engage")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn engage_rejects_with_wrong_hmac() {
    let app = build_app(Some("the_real_key"));
    let body = b"{\"x\":1}";
    let bad_sig = sign("WRONG_KEY", body);
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/command/engage")
        .header("content-type", "application/json")
        .header("x-internal-auth", &bad_sig)
        .body(Body::from(&body[..]))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn engage_accepts_valid_hmac_but_fails_audit_check() {
    // Verifica que el HMAC es aceptado y, ya pasada la auth, falla por
    // recommendation_id que no consta en audit-log (audit-log inalcanzable
    // → verify_engagement_in_audit devuelve false → 409 CONFLICT).
    let key = "good_key_99";
    let app = build_app(Some(key));
    let body = serde_json::json!({
        "interceptor_id": "I-01",
        "mavlink_system_id": 1,
        "mavlink_component_id": 1,
        "target_lat": 40.0,
        "target_lon": -3.0,
        "target_alt_m": 100.0,
        "authorization_id": "rec-doesnt-exist"
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/command/engage")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    // Pasó la auth (HMAC OK), pero falla en validar audit-log (CONFLICT esperado).
    assert!(
        resp.status() == StatusCode::CONFLICT || resp.status() == StatusCode::BAD_REQUEST,
        "esperado 409/400, obtenido {}",
        resp.status()
    );
}

#[tokio::test]
async fn engage_rejects_invalid_coordinates() {
    let key = "any_key";
    let app = build_app(Some(key));
    let body = serde_json::json!({
        "interceptor_id": "I-01",
        "mavlink_system_id": 1,
        "mavlink_component_id": 1,
        "target_lat": 200.0,   // fuera de rango
        "target_lon": -3.0,
        "target_alt_m": 100.0,
        "authorization_id": "rec-1"
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/command/engage")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}
