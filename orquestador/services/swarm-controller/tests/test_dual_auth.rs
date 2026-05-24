use std::sync::Arc;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Deserialize;
use tower::ServiceExt;
use uuid::Uuid;

use swarm_controller::api::{self, AppState};
use swarm_controller::auth::InternalAuth;
use swarm_controller::mavlink_send::MavlinkClient;

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    role: String,
    iss: String,
    aud: String,
    exp: i64,
    iat: i64,
    jti: String,
    mfa_satisfied: bool,
}

fn build_app() -> Router {
    std::env::set_var("INTERNAL_SVC_HMAC_KEY", "shared_hmac_key_123");
    std::env::remove_var("JWT_PUBLIC_KEY_PATH");
    let auth = InternalAuth::from_env();
    let state = AppState {
        mavlink: Arc::new(MavlinkClient::new("127.0.0.1:0")),
        internal_auth: auth,
        audit_log_url: "http://127.0.0.1:1".into(),
    };
    api::router(state)
}

#[tokio::test]
async fn test_dual_auth_hmac_only() {
    let app = build_app();
    let body = serde_json::json!({
        "targets": [],
        "interceptors": []
    })
    .to_string();
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/wta/assign")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_dual_auth_jwt_only() {
    std::env::set_var("JWT_PUBLIC_KEY_PATH", "nonexistent.pem");
    let app = build_app();
    let body = serde_json::json!({
        "targets": [],
        "interceptors": []
    })
    .to_string();
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/wta/assign")
        .header("content-type", "application/json")
        .header("authorization", "Bearer invalid.jwt.token")
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}
