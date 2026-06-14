use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{error, warn};

use crate::auth::{sessions, webauthn as wa, Fido2Outcome};
use crate::metrics;
use crate::state::AppState;

pub async fn webauthn_register_begin(
    State(state): State<AppState>,
    Json(req): Json<wa::RegisterBeginReq>,
) -> axum::response::Response {
    let (svc, db) = match (&state.webauthn, &state.db) {
        (Some(s), Some(d)) => (s, d),
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "webauthn no inicializado o db unavailable"})),
            )
                .into_response()
        }
    };
    let user = match sessions::find_user_for_login(db, &req.username).await {
        Ok(Some(u)) => u,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "usuario no encontrado"})),
            )
                .into_response()
        }
    };
    let existing = svc.list_credentials_for_user(db, user.id).await.unwrap_or_default();
    let display = req.display_name.unwrap_or_else(|| user.username.clone());
    match svc
        .start_registration(db, user.id, &user.username, &display, existing)
        .await
    {
        Ok((challenge_id, options)) => (
            StatusCode::OK,
            Json(wa::RegisterBeginResp { challenge_id, options }),
        )
            .into_response(),
        Err(e) => {
            warn!(error = %e, "webauthn register/begin failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }
}

pub async fn webauthn_register_finish(
    State(state): State<AppState>,
    Json(req): Json<wa::RegisterFinishReq>,
) -> axum::response::Response {
    let (svc, db) = match (&state.webauthn, &state.db) {
        (Some(s), Some(d)) => (s, d),
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "webauthn no inicializado"})),
            )
                .into_response()
        }
    };
    let user = match sessions::find_user_for_login(db, &req.username).await {
        Ok(Some(u)) => u,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "usuario no encontrado"})),
            )
                .into_response()
        }
    };
    match svc
        .finish_registration(db, user.id, req.challenge_id, &req.credential)
        .await
    {
        Ok(()) => {
            metrics::metrics()
                .webauthn_outcomes
                .with_label_values(&["registered"])
                .inc();
            (StatusCode::CREATED, Json(serde_json::json!({"registered": true}))).into_response()
        }
        Err(e) => {
            metrics::metrics()
                .webauthn_outcomes
                .with_label_values(&["register_failed"])
                .inc();
            warn!(error = %e, "webauthn register/finish failed");
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }
}

pub async fn webauthn_authenticate_begin(
    State(state): State<AppState>,
    Json(req): Json<wa::AuthenticateBeginReq>,
) -> axum::response::Response {
    let (svc, db) = match (&state.webauthn, &state.db) {
        (Some(s), Some(d)) => (s, d),
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "webauthn no inicializado"})),
            )
                .into_response()
        }
    };
    let user = match sessions::find_user_for_login(db, &req.username).await {
        Ok(Some(u)) => u,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "usuario no encontrado"})),
            )
                .into_response()
        }
    };
    match svc.start_authentication(db, user.id).await {
        Ok((challenge_id, options)) => (
            StatusCode::OK,
            Json(wa::AuthenticateBeginResp { challenge_id, options }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn webauthn_authenticate_finish(
    State(state): State<AppState>,
    Json(req): Json<wa::AuthenticateFinishReq>,
) -> axum::response::Response {
    let (svc, db) = match (&state.webauthn, &state.db) {
        (Some(s), Some(d)) => (s, d),
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": "webauthn no inicializado"})),
            )
                .into_response()
        }
    };
    let user = match sessions::find_user_for_login(db, &req.username).await {
        Ok(Some(u)) => u,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "usuario no encontrado"})),
            )
                .into_response()
        }
    };
    let outcome = svc
        .finish_authentication(db, user.id, req.challenge_id, &req.credential)
        .await;
    match outcome {
        Ok(Fido2Outcome::VerifiedReal) => {
            metrics::metrics()
                .webauthn_outcomes
                .with_label_values(&["verified_real"])
                .inc();
            let token = match state.jwt.issue_access(&user.username, &user.role_name, true) {
                Ok(t) => t,
                Err(_) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error": "jwt_issue"})),
                    )
                        .into_response()
                }
            };
            let mfa_proof = sessions::generate_mfa_proof();
            if let Some(redis) = &state.redis {
                let _ = sessions::store_mfa_proof(redis, &user.username, &mfa_proof, 60).await;
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
        Ok(other) => {
            metrics::metrics()
                .webauthn_outcomes
                .with_label_values(&[&format!("{:?}", other)])
                .inc();
            warn!(?other, "webauthn authenticate rechazado");
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "FIDO2 inválido",
                    "code": format!("{:?}", other)
                })),
            )
                .into_response()
        }
        Err(e) => {
            metrics::metrics()
                .webauthn_outcomes
                .with_label_values(&["error"])
                .inc();
            warn!(error = %e, "webauthn authenticate error");
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }
}
