use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, warn};

use crate::auth::{
    self, fido2_status_label, fido2_verify, generate_fido2_challenge,
    sessions, Fido2Outcome,
};
use crate::metrics;
use crate::state::AppState;

fn dummy_password_verify(pw: &str) -> bool {
    use std::sync::OnceLock;
    static DUMMY_HASH: OnceLock<String> = OnceLock::new();
    let dummy = DUMMY_HASH.get_or_init(|| {
        auth::hash_password("__internal_constant_time_dummy_password__")
            .expect("argon2 dummy hash gen")
    });
    auth::verify_password(pw, dummy)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub requires_mfa: bool,
    pub fido2_challenge: String,
    pub expires_in_minutes: i64,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> axum::response::Response {
    let generic_unauth = || -> axum::response::Response {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "credenciales inválidas"})),
        )
            .into_response()
    };

    let db = match &state.db {
        Some(p) => p,
        None => {
            error!("login: Postgres no disponible");
            return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "db_unavailable"}))).into_response();
        }
    };

    let user_opt = match sessions::find_user_for_login(db, &req.username).await {
        Ok(u) => u,
        Err(e) => {
            error!(error=%e, "login: error consultando users");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal"}))).into_response();
        }
    };

    let user = match user_opt {
        Some(u) => u,
        None => {
            let _ = dummy_password_verify(&req.password);
            return generic_unauth();
        }
    };

    let now = chrono::Utc::now();
    if matches!(
        sessions::lockout_status(&user, now),
        sessions::LockoutStatus::Locked
    ) {
        warn!(user = %user.username, "login bloqueado por lockout");
        return (
            StatusCode::LOCKED,
            Json(serde_json::json!({"error": "cuenta bloqueada temporalmente"})),
        )
            .into_response();
    }

    let ok = auth::verify_password(&req.password, &user.password_hash);
    if !ok {
        metrics::metrics()
            .login_attempts
            .with_label_values(&["failed"])
            .inc();
        if let Err(e) = sessions::register_failed_login(db, user.id).await {
            warn!(error=%e, "no se pudo registrar fallo de login");
        }
        return generic_unauth();
    }

    metrics::metrics()
        .login_attempts
        .with_label_values(&["success"])
        .inc();
    if let Err(e) = sessions::register_successful_login(db, user.id).await {
        warn!(error=%e, "no se pudo actualizar last_login");
    }

    let access = match state
        .jwt
        .issue_access(&user.username, &user.role_name, false)
    {
        Ok(t) => t,
        Err(e) => {
            error!(error=%e, "no se pudo emitir access token");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "jwt_issue"}))).into_response();
        }
    };

    let refresh = match sessions::issue_refresh_token(db, user.id, state.jwt.refresh_days, None, None).await {
        Ok(r) => r,
        Err(e) => {
            error!(error=%e, "no se pudo emitir refresh token");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "refresh_issue"}))).into_response();
        }
    };

    let challenge = generate_fido2_challenge();
    if let Some(r) = &state.redis {
        if let Err(e) = sessions::store_fido2_challenge(
            r,
            &user.username,
            &challenge,
            auth::FIDO2_CHALLENGE_TTL_SECONDS,
        )
        .await
        {
            warn!(error=%e, "no se pudo persistir challenge FIDO2 en Redis");
        }
    } else {
        warn!("Redis no disponible: el flujo FIDO2 stub fallará por falta de challenge");
    }

    (
        StatusCode::OK,
        Json(LoginResponse {
            access_token: access,
            refresh_token: refresh.token,
            requires_mfa: true,
            fido2_challenge: challenge,
            expires_in_minutes: state.jwt.access_minutes,
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fido2BeginReq {
    pub username: String,
}

pub async fn fido2_begin(
    State(state): State<AppState>,
    Json(r): Json<Fido2BeginReq>,
) -> axum::response::Response {
    let challenge = generate_fido2_challenge();
    if let Some(redis) = &state.redis {
        if let Err(e) = sessions::store_fido2_challenge(
            redis,
            &r.username,
            &challenge,
            auth::FIDO2_CHALLENGE_TTL_SECONDS,
        )
        .await
        {
            warn!(error=%e, "no se pudo persistir challenge FIDO2");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "redis_unavailable"})),
            )
                .into_response();
        }
    } else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "redis_unavailable"})),
        )
            .into_response();
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "challenge": challenge,
            "rp_id": "cupula.local",
            "ttl_seconds": auth::FIDO2_CHALLENGE_TTL_SECONDS,
            "mode": fido2_status_label()
        })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fido2CompleteReq {
    pub username: String,
    pub assertion: String,
    pub challenge_hex: String,
}

pub async fn fido2_complete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(r): Json<Fido2CompleteReq>,
) -> axum::response::Response {
    let stub_header = headers
        .get("x-poc-stub")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("enabled"))
        .unwrap_or(false);

    let expected: Option<String> = match &state.redis {
        Some(redis) => match sessions::consume_fido2_challenge(redis, &r.username).await {
            Ok(v) => v,
            Err(e) => {
                warn!(error=%e, "redis error consume challenge");
                None
            }
        },
        None => None,
    };

    let outcome = fido2_verify(&r.assertion, expected.as_deref(), &r.challenge_hex, stub_header);
    match outcome {
        Fido2Outcome::StubCanaryAccepted | Fido2Outcome::VerifiedReal => {}
        other => {
            warn!(user = %r.username, ?other, "FIDO2 rechazado");
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "FIDO2 inválido", "code": format!("{:?}", other)})),
            )
                .into_response();
        }
    }

    let role = match &state.db {
        Some(db) => match sessions::find_user_for_login(db, &r.username).await {
            Ok(Some(u)) => u.role_name,
            _ => "OPS_OFFICER".into(),
        },
        None => "OPS_OFFICER".into(),
    };

    let token = match state.jwt.issue_access(&r.username, &role, true) {
        Ok(t) => t,
        Err(e) => {
            error!(error=%e, "no se pudo emitir token MFA");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "jwt_issue"}))).into_response();
        }
    };

    let mfa_proof = sessions::generate_mfa_proof();
    if let Some(redis) = &state.redis {
        let _ = sessions::store_mfa_proof(redis, &r.username, &mfa_proof, 60).await;
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "access_token": token,
            "mfa_satisfied": true,
            "mfa_proof": mfa_proof
        })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RefreshReq {
    pub refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct RefreshResp {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in_minutes: i64,
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(req): Json<RefreshReq>,
) -> axum::response::Response {
    let db = match &state.db {
        Some(p) => p,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error":"db_unavailable"}))).into_response(),
    };

    let session = match sessions::find_session(db, &req.refresh_token).await {
        Ok(Some(s)) => s,
        _ => return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"refresh inválido"}))).into_response(),
    };

    let now = chrono::Utc::now();
    if session.revoked_at.is_some() || session.expires_at < now {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"refresh expirado/revocado"}))).into_response();
    }

    let user_row = sqlx::query_as::<_, (String, String)>(
        "SELECT u.username, r.name FROM users u INNER JOIN roles r ON r.id = u.role_id WHERE u.id = $1 AND u.active = TRUE",
    )
    .bind(session.user_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    let (username, role) = match user_row {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"user_inactive"}))).into_response(),
    };

    if let Err(e) = sessions::revoke_session(db, session.id).await {
        warn!(error=%e, "no se pudo revocar sesión");
    }

    let access = match state.jwt.issue_access(&username, &role, false) {
        Ok(t) => t,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"jwt"}))).into_response(),
    };
    let new_refresh = match sessions::issue_refresh_token(db, session.user_id, state.jwt.refresh_days, None, None).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error":"refresh"}))).into_response(),
    };

    (
        StatusCode::OK,
        Json(RefreshResp {
            access_token: access,
            refresh_token: new_refresh.token,
            expires_in_minutes: state.jwt.access_minutes,
        }),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LogoutReq {
    pub refresh_token: Option<String>,
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LogoutReq>,
) -> axum::response::Response {
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));
    if let Some(token) = bearer {
        if let Ok(claims) = state.jwt.verify(token) {
            let now = chrono::Utc::now().timestamp();
            let ttl = (claims.exp - now).max(0) as u64;
            if let Some(redis) = &state.redis {
                if let Err(e) = sessions::blacklist_jti(redis, &claims.jti, ttl).await {
                    warn!(error=%e, "no se pudo blacklistear JTI");
                }
            }
        }
    }

    if let (Some(db), Some(rt)) = (&state.db, req.refresh_token.as_deref()) {
        if let Ok(Some(s)) = sessions::find_session(db, rt).await {
            let _ = sessions::revoke_session(db, s.id).await;
        }
    }

    (StatusCode::NO_CONTENT, ()).into_response()
}
