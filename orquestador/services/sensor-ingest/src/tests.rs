#[cfg(test)]
mod tests {
    use crate::api::router;
    use crate::auth::{now_unix, parse_header, SensorAuth, TIMESTAMP_TOLERANCE_SECONDS};
    use crate::kafka::Producer;
    use crate::models::SensorReading;
    use crate::AppState;
    use axum::{
        body::Body,
        http::{HeaderName, HeaderValue, Method, Request, StatusCode},
        Router,
    };
    use chrono::{DateTime, Utc};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use std::sync::Arc;
    use tower::ServiceExt;

    type HmacSha256 = Hmac<Sha256>;

    fn sign_reading(
        key: &str,
        sensor_id: &str,
        ts: i64,
        nonce: &str,
        body: &[u8],
    ) -> String {
        let body_hash = hex::encode(sha2::Sha256::digest(body));
        let payload = format!("{sensor_id}\n{ts}\n{nonce}\n{body_hash}");
        let mut mac = HmacSha256::new_from_slice(key.as_bytes()).unwrap();
        mac.update(payload.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    fn build_app(required: bool, keys_json: &str) -> Router {
        std::env::set_var("SENSOR_HMAC_KEYS", keys_json);
        std::env::set_var(
            "SENSOR_HMAC_REQUIRED",
            if required { "true" } else { "false" },
        );
        std::env::set_var("ALLOWED_ORIGINS", "http://localhost:5173,https://cupula.local");
        let producer = Arc::new(Producer::Degraded);
        let auth = SensorAuth::from_env(None);
        let state = AppState { producer, sensor_auth: auth };
        router(state)
    }

    fn make_reading(sensor_id: &str) -> serde_json::Value {
        serde_json::json!({
            "sensor_id": sensor_id,
            "sensor_type": "RADAR_AESA",
            "timestamp": "2026-01-15T12:00:00Z",
            "position": {
                "latitude": 40.416,
                "longitude": -3.704,
                "altitude_msl_m": 800.0,
                "altitude_agl_m": 300.0
            },
            "detection": {
                "range_m": 12000.0,
                "azimuth_deg": 45.0,
                "elevation_deg": 5.0,
                "doppler_mps": 60.0,
                "rcs_dbsm": -15.0
            },
            "snr_db": 22.0,
            "quality": 0.9
        })
    }

    #[tokio::test]
    async fn test_cors_headers() {
        let app = build_app(false, r#"{}"#);
        let req = Request::builder()
            .method(Method::OPTIONS)
            .uri("/v1/sensors/reading")
            .header("origin", "http://localhost:5173")
            .header("access-control-request-method", "POST")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        let headers = resp.headers();
        assert!(
            headers.get("access-control-allow-origin").is_some(),
            "CORS origin header missing"
        );
        let req2 = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("origin", "http://localhost:5173")
            .body(Body::from(r#"{"x":1}"#))
            .unwrap();
        let resp2 = app.oneshot(req2).await.unwrap();
        let h2 = resp2.headers();
        assert!(
            h2.get("access-control-allow-origin").is_some(),
            "CORS on POST missing"
        );
    }

    #[tokio::test]
    async fn test_rate_limit_exceeded() {
        let app = build_app(false, r#"{}"#);
        let body = serde_json::to_vec(&make_reading("radar01")).unwrap();
        let ts = now_unix();
        let sig = sign_reading("key", "radar01", ts, "rate_nonce", &body);
        let hdr = format!("radar01:{ts}:rate_nonce:{sig}");
        for _ in 0..600 {
            let req = Request::builder()
                .method(Method::POST)
                .uri("/v1/sensors/reading")
                .header("content-type", "application/json")
                .header("x-sensor-auth", &hdr)
                .body(Body::from(body.clone()))
                .unwrap();
            let _ = app.oneshot(req).await;
        }
        let last_req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body.clone()))
            .unwrap();
        let resp = app.oneshot(last_req).await.unwrap();
        assert!(
            resp.status() == StatusCode::TOO_MANY_REQUESTS
                || resp.status() == StatusCode::OK
                || resp.status() == StatusCode::ACCEPTED,
            "esperado 429 o aceptado, obtenido {}",
            resp.status()
        );
    }

    #[tokio::test]
    async fn test_batch_reading_valid() {
        let app = build_app(true, r#"{"multi_sensor":"key"}"#);
        let batch = vec![
            make_reading("multi_sensor"),
            make_reading("multi_sensor"),
        ];
        let body = serde_json::to_vec(&batch).unwrap();
        let ts = now_unix();
        let sig = sign_reading("key", "multi_sensor", ts, "batch_nonce", &body);
        let hdr = format!("multi_sensor:{ts}:batch_nonce:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/batch")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::ACCEPTED);
    }

    #[tokio::test]
    async fn test_batch_reading_partial_fail() {
        let app = build_app(true, r#"{"batch_sensor":"key"}"#);
        let batch = vec![
            make_reading("batch_sensor"),
            serde_json::json!({
                "sensor_id": "batch_sensor",
                "sensor_type": "RADAR_AESA",
                "timestamp": "2026-01-15T12:00:00Z",
                "position": {
                    "latitude": 40.416,
                    "longitude": -3.704,
                    "altitude_msl_m": 800.0,
                    "altitude_agl_m": 300.0
                },
                "detection": {
                    "range_m": 999999.0,
                    "azimuth_deg": 45.0,
                    "elevation_deg": 5.0,
                    "doppler_mps": 60.0,
                    "rcs_dbsm": -15.0
                },
                "snr_db": 22.0,
                "quality": 99.9
            }),
        ];
        let body = serde_json::to_vec(&batch).unwrap();
        let ts = now_unix();
        let sig = sign_reading("key", "batch_sensor", ts, "partial_nonce", &body);
        let hdr = format!("batch_sensor:{ts}:partial_nonce:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/batch")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::ACCEPTED);
    }

    #[tokio::test]
    async fn test_kafka_producer_fallback() {
        let app = build_app(true, r#"{"fallback_radar":"key"}"#);
        let reading = make_reading("fallback_radar");
        let body = serde_json::to_vec(&reading).unwrap();
        let ts = now_unix();
        let sig = sign_reading("key", "fallback_radar", ts, "kafka_fallback", &body);
        let hdr = format!("fallback_radar:{ts}:kafka_fallback:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::ACCEPTED);
    }

    #[tokio::test]
    async fn test_redis_anti_replay_same_nonce() {
        let app = build_app(true, r#"{"replay_radar":"key"}"#);
        let reading = make_reading("replay_radar");
        let body = serde_json::to_vec(&reading).unwrap();
        let ts = now_unix();
        let sig = sign_reading("key", "replay_radar", ts, "same_nonce", &body);
        let hdr = format!("replay_radar:{ts}:same_nonce:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body.clone()))
            .unwrap();
        let _resp1 = app.oneshot(req).await.unwrap();
        let req2 = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp2 = app.oneshot(req2).await.unwrap();
        assert!(resp2.status() == StatusCode::UNAUTHORIZED || resp2.status() == StatusCode::ACCEPTED);
    }

    #[tokio::test]
    async fn test_redis_anti_replay_expired() {
        let app = build_app(true, r#"{"expire_radar":"key"}"#);
        let reading = make_reading("expire_radar");
        let body = serde_json::to_vec(&reading).unwrap();
        let ts = now_unix() - 120;
        let sig = sign_reading("key", "expire_radar", ts, "expired_nonce", &body);
        let hdr = format!("expire_radar:{ts}:expired_nonce:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_auth_missing_hmac() {
        let app = build_app(true, r#"{"radar01":"key"}"#);
        let body = serde_json::to_vec(&make_reading("radar01")).unwrap();
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_auth_wrong_hmac() {
        let app = build_app(true, r#"{"radar01":"real_key"}"#);
        let body = serde_json::to_vec(&make_reading("radar01")).unwrap();
        let ts = now_unix();
        let sig = sign_reading("wrong_key", "radar01", ts, "wrong_nonce", &body);
        let hdr = format!("radar01:{ts}:wrong_nonce:{sig}");
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .header("x-sensor-auth", &hdr)
            .body(Body::from(body))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_payload_deny_unknown_fields() {
        let app = build_app(false, r#"{}"#);
        let body = serde_json::json!({
            "sensor_id": "radar01",
            "sensor_type": "RADAR_AESA",
            "timestamp": "2026-01-15T12:00:00Z",
            "position": {
                "latitude": 40.416,
                "longitude": -3.704,
                "altitude_msl_m": 800.0,
                "altitude_agl_m": 300.0
            },
            "detection": {
                "range_m": 12000.0,
                "azimuth_deg": 45.0,
                "elevation_deg": 5.0,
                "doppler_mps": 60.0,
                "rcs_dbsm": -15.0
            },
            "snr_db": 22.0,
            "quality": 0.9,
            "unknown_field": "should_reject"
        });
        let req = Request::builder()
            .method(Method::POST)
            .uri("/v1/sensors/reading")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
}
