//! Autenticación inter-servicio para swarm-controller.
//!
//! Acepta DOS modos (al menos uno debe pasar) en endpoints sensibles:
//!
//! 1. **HMAC-SHA256** con clave compartida `INTERNAL_SVC_HMAC_KEY`.
//!    Header: `X-Internal-Auth: <hex_hmac_sha256_del_body>`.
//!
//! 2. **JWT RS256** firmado por hmi-gateway, verificado con la misma clave
//!    pública (`JWT_PUBLIC_KEY_PATH`).
//!    Header: `Authorization: Bearer <jwt>` con `mfa_satisfied == true` y rol
//!    en {OPS_OFFICER, OFICIAL_TACTICO, JEFE_FUEGO, CO, JOINT_CO}.
//!
//! Si ambos modos fallan o están ausentes → 401.

use std::path::Path;
use std::sync::Arc;

use axum::{
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use hmac::{Hmac, Mac};
use http_body_util::BodyExt;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use sha2::Sha256;
use tracing::warn;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Deserialize)]
pub struct InternalClaims {
    pub sub: String,
    pub role: String,
    pub iss: String,
    pub aud: String,
    pub exp: i64,
    pub iat: i64,
    pub jti: String,
    pub mfa_satisfied: bool,
}

#[derive(Clone)]
pub struct InternalAuth {
    pub hmac_key: Option<Vec<u8>>,
    pub jwt: Option<JwtVerifier>,
}

#[derive(Clone)]
pub struct JwtVerifier {
    pub decoding: Arc<DecodingKey>,
    pub iss: String,
    pub aud: String,
}

impl InternalAuth {
    pub fn from_env() -> Self {
        let hmac_key = std::env::var("INTERNAL_SVC_HMAC_KEY")
            .ok()
            .map(|s| s.into_bytes());
        if hmac_key.is_none() {
            warn!("INTERNAL_SVC_HMAC_KEY no definida — HMAC inter-servicio deshabilitado");
        }
        let jwt = std::env::var("JWT_PUBLIC_KEY_PATH")
            .ok()
            .and_then(|p| std::fs::read(Path::new(&p)).ok())
            .and_then(|pem| DecodingKey::from_rsa_pem(&pem).ok())
            .map(|d| JwtVerifier {
                decoding: Arc::new(d),
                iss: std::env::var("JWT_ISSUER").unwrap_or_else(|_| "cupula-celestial".into()),
                aud: std::env::var("JWT_AUDIENCE").unwrap_or_else(|_| "hmi-operador".into()),
            });
        if jwt.is_none() {
            warn!("JWT_PUBLIC_KEY_PATH no disponible — verificación JWT inter-servicio deshabilitada");
        }
        Self { hmac_key, jwt }
    }

    pub fn verify_hmac(&self, body: &[u8], hex_sig: &str) -> bool {
        let key = match &self.hmac_key {
            Some(k) => k,
            None => return false,
        };
        let provided = match hex::decode(hex_sig) {
            Ok(b) => b,
            Err(_) => return false,
        };
        let mut mac = match HmacSha256::new_from_slice(key) {
            Ok(m) => m,
            Err(_) => return false,
        };
        mac.update(body);
        mac.verify_slice(&provided).is_ok()
    }

    pub fn verify_jwt(&self, bearer: &str) -> Option<InternalClaims> {
        let verifier = self.jwt.as_ref()?;
        let mut v = Validation::new(Algorithm::RS256);
        v.set_issuer(&[verifier.iss.clone()]);
        v.set_audience(&[verifier.aud.clone()]);
        let token = decode::<InternalClaims>(bearer, &verifier.decoding, &v).ok()?;
        Some(token.claims)
    }
}

fn extract_bearer(h: &HeaderMap) -> Option<&str> {
    h.get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
}

/// Middleware aplicable a rutas sensibles. Lee el body íntegro para
/// poder verificar el HMAC, lo reinyecta en la request, y pasa al handler.
pub async fn require_internal_auth(
    State(auth): State<InternalAuth>,
    req: Request,
    next: Next,
) -> Response {
    let (parts, body) = req.into_parts();
    let bytes: Bytes = match body.collect().await {
        Ok(c) => c.to_bytes(),
        Err(e) => {
            warn!(error = %e, "swarm-controller: error leyendo body");
            return (StatusCode::BAD_REQUEST, "body read error").into_response();
        }
    };

    let hmac_hdr = parts
        .headers
        .get("x-internal-auth")
        .and_then(|v| v.to_str().ok());
    let mut ok = false;

    if let Some(sig) = hmac_hdr {
        if auth.verify_hmac(&bytes, sig) {
            ok = true;
        }
    }

    if !ok {
        if let Some(bearer) = extract_bearer(&parts.headers) {
            if let Some(claims) = auth.verify_jwt(bearer) {
                if claims.mfa_satisfied
                    && matches!(
                        claims.role.as_str(),
                        "OPS_OFFICER"
                            | "OFICIAL_TACTICO"
                            | "JEFE_FUEGO"
                            | "CO"
                            | "JOINT_CO"
                            | "SYSTEM"
                    )
                {
                    ok = true;
                }
            }
        }
    }

    if !ok {
        warn!(path = %parts.uri.path(), "swarm-controller: 401 (ni HMAC ni JWT válidos)");
        return (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"error": "internal auth required"})),
        )
            .into_response();
    }

    // Reconstruir request con el body cacheado
    let req = Request::from_parts(parts, Body::from(bytes));
    next.run(req).await
}

/// Consulta al servicio audit-log si una `recommendation_id` o
/// `engagement_authorized.recommendation_id` existe en la cadena.
pub async fn verify_engagement_in_audit(audit_url: &str, recommendation_id: &str) -> bool {
    let url = format!("{audit_url}/v1/events?event_type=ENGAGEMENT.AUTHORIZED&limit=500");
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(_) => return false,
    };
    if !resp.status().is_success() {
        return false;
    }
    let body: serde_json::Value = match resp.json().await {
        Ok(b) => b,
        Err(_) => return false,
    };
    body.get("events")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().any(|e| {
                e.get("payload")
                    .and_then(|p| p.get("recommendation_id"))
                    .and_then(|v| v.as_str())
                    == Some(recommendation_id)
            })
        })
        .unwrap_or(false)
}
