use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Serialize;

use crate::auth;
use crate::state::AppState;

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    fido2_mode: &'static str,
    poc_banner: bool,
}

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(Health {
        status: "ok",
        service: "hmi-gateway",
        fido2_mode: auth::fido2_status_label(),
        poc_banner: state.poc_banner_active,
    })
}
