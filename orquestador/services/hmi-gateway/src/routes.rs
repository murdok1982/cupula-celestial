use std::sync::Arc;

use axum::{
    http::{HeaderName, HeaderValue, Method},
    middleware,
    routing::{get, post},
    Router,
};
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::handlers;
use crate::security_headers;
use crate::state::AppState;
use crate::ws::{self, WsHub};

pub fn build(state: AppState, hub: WsHub) -> Router {
    let allowed_origins_env =
        std::env::var("ALLOWED_ORIGINS").unwrap_or_else(|_| "http://localhost:5173".into());
    let allowed_origins: Vec<HeaderValue> = allowed_origins_env
        .split(',')
        .filter_map(|o| o.trim().parse::<HeaderValue>().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            HeaderName::from_static("x-poc-stub"),
            HeaderName::from_static("sec-websocket-protocol"),
        ])
        .allow_origin(allowed_origins);

    let login_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(12)
            .burst_size(5)
            .finish()
            .expect("login governor config"),
    );
    let fido2_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(6)
            .burst_size(10)
            .finish()
            .expect("fido2 governor config"),
    );
    let authorize_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(30)
            .finish()
            .expect("authorize governor config"),
    );
    let session_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(20)
            .finish()
            .expect("session governor config"),
    );

    let auth_login_router = Router::new()
        .route("/auth/login", post(handlers::login))
        .layer(GovernorLayer { config: login_governor })
        .with_state(state.clone());

    let auth_fido2_router = Router::new()
        .route("/auth/fido2/begin", post(handlers::fido2_begin))
        .route("/auth/fido2/complete", post(handlers::fido2_complete))
        .route("/auth/webauthn/register/begin", post(handlers::webauthn_register_begin))
        .route("/auth/webauthn/register/finish", post(handlers::webauthn_register_finish))
        .route(
            "/auth/webauthn/authenticate/begin",
            post(handlers::webauthn_authenticate_begin),
        )
        .route(
            "/auth/webauthn/authenticate/finish",
            post(handlers::webauthn_authenticate_finish),
        )
        .layer(GovernorLayer { config: fido2_governor })
        .with_state(state.clone());

    let authorize_router = Router::new()
        .route("/engagement/authorize", post(handlers::authorize))
        .layer(GovernorLayer { config: authorize_governor })
        .with_state(state.clone());

    let auth_session_router = Router::new()
        .route("/auth/refresh", post(handlers::refresh))
        .route("/auth/logout", post(handlers::logout))
        .layer(GovernorLayer { config: session_governor })
        .with_state(state.clone());

    let ws_router: Router = Router::new()
        .route("/ws", get(ws::upgrade))
        .with_state(hub);

    let health_router = Router::new()
        .route("/health", get(handlers::health))
        .route("/metrics", get(crate::metrics::handler))
        .with_state(state);

    Router::new()
        .merge(health_router)
        .merge(auth_login_router)
        .merge(auth_fido2_router)
        .merge(auth_session_router)
        .merge(authorize_router)
        .merge(ws_router)
        .layer(cors)
        .layer(middleware::from_fn(security_headers::apply_security_headers))
        .layer(TraceLayer::new_for_http())
}
