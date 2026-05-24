use std::sync::Arc;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    Router,
};
use tower::ServiceExt;

use swarm_controller::allocator::{Interceptor, Target};
use swarm_controller::api::{self, AppState};
use swarm_controller::auth::InternalAuth;
use swarm_controller::mavlink_send::MavlinkClient;

type HmacSha256 = hmac::Hmac<sha2::Sha256>;

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
        audit_log_url: "http://127.0.0.1:1".into(),
    };
    api::router(state)
}

fn sign(key: &str, body: &[u8]) -> String {
    let mut mac =
        <hmac::Hmac<sha2::Sha256> as hmac::Mac>::new_from_slice(key.as_bytes()).unwrap();
    mac.update(body);
    hex::encode(mac.finalize().into_bytes())
}

#[tokio::test]
async fn test_assign_no_targets() {
    let key = "test_key_wta";
    let app = build_app(Some(key));
    let body = serde_json::json!({
        "targets": [],
        "interceptors": []
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/wta/assign")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_assign_no_interceptors() {
    let key = "test_key_wta2";
    let app = build_app(Some(key));
    let targets = vec![Target {
        id: "T1".into(),
        priority: 5,
        tti_seconds: 30.0,
        min_interceptors: 1,
    }];
    let body = serde_json::json!({
        "targets": targets,
        "interceptors": []
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/wta/assign")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_assign_more_targets_than_interceptors() {
    let key = "test_key_wta3";
    let app = build_app(Some(key));
    let targets: Vec<Target> = (0..10)
        .map(|i| Target {
            id: format!("T{i}"),
            priority: (i as u8 % 10) + 1,
            tti_seconds: 10.0 + i as f64,
            min_interceptors: 1,
        })
        .collect();
    let interceptors: Vec<Interceptor> = (0..3)
        .map(|j| Interceptor {
            id: format!("I{j}"),
            ready: true,
            time_to_target_seconds: targets.iter().map(|_| 2.0 + j as f64).collect(),
            pk_per_target: targets.iter().map(|_| 0.85).collect(),
            munition_remaining: 5,
        })
        .collect();
    let body = serde_json::json!({
        "targets": targets,
        "interceptors": interceptors
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/wta/assign")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_abort_nonexistent_interceptor() {
    let key = "abort_key";
    let app = build_app(Some(key));
    let body = serde_json::json!({
        "interceptor_id": "I-NONEXISTENT",
        "mavlink_system_id": 99,
        "reason": "test abort"
    })
    .to_string();
    let sig = sign(key, body.as_bytes());
    let req = Request::builder()
        .method(Method::POST)
        .uri("/v1/command/abort")
        .header("content-type", "application/json")
        .header("x-internal-auth", &sig)
        .body(Body::from(body))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert!(
        resp.status() == StatusCode::OK || resp.status() == StatusCode::BAD_GATEWAY,
        "esperado OK o BAD_GATEWAY, obtenido {}",
        resp.status()
    );
}

#[tokio::test]
async fn test_engage_invalid_coords() {
    let key = "bad_coords_key";
    let app = build_app(Some(key));
    let body = serde_json::json!({
        "interceptor_id": "I-01",
        "mavlink_system_id": 1,
        "mavlink_component_id": 1,
        "target_lat": 200.0,
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
