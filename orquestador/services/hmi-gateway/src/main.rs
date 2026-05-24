//! hmi-gateway: WebSocket bridge + REST de auth/engagement entre HMI y bus.
//!
//! Mejoras de seguridad respecto al PoC inicial:
//! - Login con consulta real a `users` (Argon2id OWASP) + bloqueo tras 5 fallos.
//! - FIDO2 stub explícito controlado por `FIDO2_REAL_VERIFY`; canario `POC_STUB_OK`.
//! - Challenges FIDO2 single-use en Redis con TTL 60s.
//! - JWT blacklist (logout) en Redis.
//! - Refresh token rotation con sessions en BD.
//! - Authorization level mapping (rol → rango), refuerza ROE.
//! - Rate limiting por endpoint con `tower-governor`.
//! - Headers de seguridad (HSTS, X-Frame-Options, ...).
//! - Validación HMAC interna para llamadas hacia swarm-controller.
//! - Banner de arranque advirtiendo de los stubs activos.

mod auth;
mod authz;
mod crypto;
mod hmac_internal;
mod metrics;
mod security_headers;
mod ws;
#[cfg(test)]
mod tests;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderName, HeaderValue, Method, StatusCode},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::Message;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::signal;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use crate::auth::{
    fido2_real_verify_enabled, fido2_status_label, fido2_verify, generate_fido2_challenge,
    sessions, webauthn as wa, Fido2Outcome, JwtKeys,
};
use crate::ws::{upgrade as ws_upgrade, WsHub};

use crate::authz::{required_rank, role_rank};

#[derive(Clone)]
struct AppState {
    jwt: Arc<JwtKeys>,
    producer: Option<Arc<FutureProducer>>,
    db: Option<PgPool>,
    redis: Option<Arc<redis::Client>>,
    audit_log_url: String,
    /// Activo cuando una pieza del subsistema está en modo stub.
    poc_banner_active: bool,
    /// Servicio WebAuthn (None si REAL_VERIFY=false → legacy stub).
    webauthn: Option<Arc<wa::WebauthnService>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    // ============== BANNER DE ARRANQUE ==============
    let fido2_label = fido2_status_label();
    if !fido2_real_verify_enabled() {
        warn!(
            "⚠️  FIDO2 STUB ACTIVO — PoC ONLY — NO USE FOR OPERATIONS (FIDO2={})",
            fido2_label
        );
    }
    warn!(
        "⚠️  POC NO APTO PARA OPERACIÓN REAL — STUBS ACTIVOS: FIDO2={}",
        fido2_label
    );

    let bind: SocketAddr = std::env::var("HMI_BIND")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;

    let jwt = Arc::new(JwtKeys::from_env().unwrap_or_else(|e| {
        error!("FATAL: JWT keys no disponibles ({e}). Ejecuta scripts/generate_certs.sh");
        std::process::exit(1);
    }));

    let hub = WsHub::new(jwt.clone());

    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "redpanda:9092".into());
    let producer: Option<Arc<FutureProducer>> = ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("client.id", "hmi-gateway")
        .set("acks", "all")
        .create()
        .map(Arc::new)
        .ok();

    // DB pool (opcional: en arranque temprano puede no estar listo en algunos tests).
    let db: Option<PgPool> = match std::env::var("DATABASE_URL") {
        Ok(url) => match PgPoolOptions::new()
            .max_connections(8)
            .connect(&url)
            .await
        {
            Ok(p) => Some(p),
            Err(e) => {
                warn!(error = %e, "Postgres no disponible; algunas rutas devolverán 503");
                None
            }
        },
        Err(_) => {
            warn!("DATABASE_URL no definida; algunas rutas devolverán 503");
            None
        }
    };

    let redis: Option<Arc<redis::Client>> = std::env::var("REDIS_URL")
        .ok()
        .and_then(|u| redis::Client::open(u).ok())
        .map(Arc::new);
    if redis.is_none() {
        warn!("REDIS_URL no definida o cliente no creable; FIDO2 challenge/blacklist degradados");
    }

    let audit_log_url =
        std::env::var("AUDIT_LOG_URL").unwrap_or_else(|_| "http://audit-log:9300".into());

    // Tarea: consumir tracks.confirmed, recommendations, alerts y publicarlos al hub
    let hub_clone = hub.clone();
    let brokers_clone = brokers.clone();
    tokio::spawn(async move {
        match ClientConfig::new()
            .set("bootstrap.servers", &brokers_clone)
            .set("group.id", "hmi-gateway")
            .set("auto.offset.reset", "earliest")
            .create::<StreamConsumer>()
        {
            Ok(c) => {
                if c.subscribe(&["tracks.confirmed", "recommendations", "alerts"]).is_err() {
                    warn!("hmi-gateway no puede suscribirse a topics");
                    return;
                }
                loop {
                    if let Ok(m) = c.recv().await {
                        if let Some(p) = m.payload() {
                            if let Ok(text) = std::str::from_utf8(p) {
                                let topic = m.topic();
                                let envelope = serde_json::json!({
                                    "topic": topic,
                                    "payload": serde_json::from_str::<serde_json::Value>(text)
                                        .unwrap_or_else(|_| serde_json::Value::String(text.into())),
                                });
                                hub_clone.publish(envelope.to_string());
                            }
                        }
                    }
                }
            }
            Err(e) => warn!(error = %e, "kafka consumer no disponible en hmi-gateway"),
        }
    });

    // Reseed del demo user con Argon2id OWASP si detecta el hash dummy de la
    // migración 004 (sólo para PoC; en producción se usa una herramienta CLI).
    if let Some(pool) = &db {
        if let Err(e) = ensure_demo_password_argon2_owasp(pool).await {
            warn!(error = %e, "no se pudo reseed del demo password");
        }
    }

    // Instanciar WebauthnService cuando estamos en modo REAL.
    let webauthn = if fido2_real_verify_enabled() {
        match wa::WebauthnService::from_env() {
            Ok(svc) => {
                info!(rp_id = %svc.rp_id, rp_origin = %svc.rp_origin, "WebAuthn REAL inicializado");
                Some(Arc::new(svc))
            }
            Err(e) => {
                error!(error = %e, "FATAL: FIDO2_REAL_VERIFY=true pero WebAuthn no inicializa");
                None
            }
        }
    } else {
        None
    };

    let state = AppState {
        jwt: jwt.clone(),
        producer,
        db,
        redis,
        audit_log_url,
        poc_banner_active: !fido2_real_verify_enabled(),
        webauthn,
    };

    // -----------------------------------------------------------------
    // CORS multi-origin (H-MED-001)
    // -----------------------------------------------------------------
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

    // -----------------------------------------------------------------
    // Rate limiters (H-ALT-004)
    // -----------------------------------------------------------------
    let login_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(12) // burst-style: 5 por minuto ≈ 12s
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

    let auth_login_router = Router::new()
        .route("/auth/login", post(login))
        .layer(GovernorLayer { config: login_governor })
        .with_state(state.clone());

    let auth_fido2_router = Router::new()
        .route("/auth/fido2/begin", post(fido2_begin))
        .route("/auth/fido2/complete", post(fido2_complete))
        // FASE 2: endpoints webauthn-rs REAL
        .route("/auth/webauthn/register/begin", post(webauthn_register_begin))
        .route("/auth/webauthn/register/finish", post(webauthn_register_finish))
        .route(
            "/auth/webauthn/authenticate/begin",
            post(webauthn_authenticate_begin),
        )
        .route(
            "/auth/webauthn/authenticate/finish",
            post(webauthn_authenticate_finish),
        )
        .layer(GovernorLayer { config: fido2_governor })
        .with_state(state.clone());

    let authorize_router = Router::new()
        .route("/engagement/authorize", post(authorize))
        .layer(GovernorLayer { config: authorize_governor })
        .with_state(state.clone());

    let session_governor = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(20)
            .finish()
            .expect("session governor config"),
    );
    let auth_session_router = Router::new()
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .layer(GovernorLayer { config: session_governor })
        .with_state(state.clone());

    // WebSocket endpoint usa estado WsHub directamente.
    let ws_router: Router = Router::new()
        .route("/ws", get(ws_upgrade))
        .with_state(hub.clone());

    let health_router = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics::handler))
        .with_state(state.clone());

    let app: Router = Router::new()
        .merge(health_router)
        .merge(auth_login_router)
        .merge(auth_fido2_router)
        .merge(auth_session_router)
        .merge(authorize_router)
        .merge(ws_router)
        .layer(cors)
        .layer(middleware::from_fn(security_headers::apply_security_headers))
        .layer(TraceLayer::new_for_http());

    info!(%bind, "hmi-gateway listening");

    // FASE 2: arrancar con TLS si los certs están disponibles (mTLS opcional).
    if let Some(bundle) = crypto::tls::load_from_env() {
        info!(
            "mTLS habilitado (rustls). require_client_cert={}",
            bundle.require_client_cert
        );
        let server_config = if bundle.require_client_cert && !bundle.ca_certs.is_empty() {
            let mut roots = rustls::RootCertStore::empty();
            for c in &bundle.ca_certs {
                roots.add(c.clone()).ok();
            }
            let verifier = rustls::server::WebPkiClientVerifier::builder(Arc::new(roots))
                .build()
                .map_err(|e| anyhow::anyhow!("client verifier: {e:?}"))?;
            rustls::ServerConfig::builder()
                .with_client_cert_verifier(verifier)
                .with_single_cert(bundle.cert_chain, bundle.key)
                .map_err(|e| anyhow::anyhow!("rustls config: {e:?}"))?
        } else {
            rustls::ServerConfig::builder()
                .with_no_client_auth()
                .with_single_cert(bundle.cert_chain, bundle.key)
                .map_err(|e| anyhow::anyhow!("rustls config: {e:?}"))?
        };
        let rustls_cfg = axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(server_config));
        axum_server::bind_rustls(bind, rustls_cfg)
            .serve(app.into_make_service_with_connect_info::<SocketAddr>())
            .await?;
    } else {
        warn!("TLS no configurado; arrancando en plaintext (sólo dev/PoC)");
        let listener = tokio::net::TcpListener::bind(bind).await?;
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
        })
        .await?;
    }
    Ok(())
}

// ===========================================================================
// WEBAUTHN-RS handlers REAL (FASE 2)
// ===========================================================================

async fn webauthn_register_begin(
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

async fn webauthn_register_finish(
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

async fn webauthn_authenticate_begin(
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

async fn webauthn_authenticate_finish(
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
            // Emitir token MFA-satisfied + mfa_proof
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

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    fido2_mode: &'static str,
    poc_banner: bool,
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(Health {
        status: "ok",
        service: "hmi-gateway",
        fido2_mode: fido2_status_label(),
        poc_banner: state.poc_banner_active,
    })
}

// ===========================================================================
// LOGIN — consulta `users`, Argon2id, lockout (H-ALT-003, H-ALT-005)
// ===========================================================================

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Debug, Serialize)]
struct LoginResponse {
    access_token: String,
    refresh_token: String,
    requires_mfa: bool,
    fido2_challenge: String,
    expires_in_minutes: i64,
}

/// Constant-time dummy verify para evitar user-enumeration por timing.
///
/// Computa un hash Argon2id real al primer uso (LazyLock) y luego verifica
/// la password recibida contra él. El hash siempre dará "no coincide" pero
/// el tiempo de cómputo es el mismo que el de un hash válido.
fn dummy_password_verify(pw: &str) -> bool {
    use std::sync::OnceLock;
    static DUMMY_HASH: OnceLock<String> = OnceLock::new();
    let dummy = DUMMY_HASH.get_or_init(|| {
        auth::hash_password("__internal_constant_time_dummy_password__")
            .expect("argon2 dummy hash gen")
    });
    auth::verify_password(pw, dummy)
}

async fn login(
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

    // Bypass timing: si user no existe, hacemos verify dummy.
    let user = match user_opt {
        Some(u) => u,
        None => {
            let _ = dummy_password_verify(&req.password);
            return generic_unauth();
        }
    };

    // Lockout check
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

    // Verify password
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

    // Emitir access (mfa=false) + refresh + challenge FIDO2 (Redis)
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

// ===========================================================================
// FIDO2 (STUB EXPLÍCITO) — H-CRIT-002
// ===========================================================================

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Fido2BeginReq {
    username: String,
}

async fn fido2_begin(
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
struct Fido2CompleteReq {
    username: String,
    /// Assertion del autenticador. En stub mode debe ser exactamente "POC_STUB_OK".
    assertion: String,
    /// Challenge declarado por el cliente (debe matchear el server-side).
    challenge_hex: String,
}

async fn fido2_complete(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(r): Json<Fido2CompleteReq>,
) -> axum::response::Response {
    let stub_header = headers
        .get("x-poc-stub")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("enabled"))
        .unwrap_or(false);

    // Recuperar challenge server-side (single-use)
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

    // Cargar rol real del usuario para emitir token MFA-satisfied
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

    // Generar mfa_proof server-side (TTL 60s, single-use) — H-MED-008
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

// ===========================================================================
// REFRESH / LOGOUT — H-ALT-001
// ===========================================================================

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RefreshReq {
    refresh_token: String,
}

#[derive(Debug, Serialize)]
struct RefreshResp {
    access_token: String,
    refresh_token: String,
    expires_in_minutes: i64,
}

async fn refresh(
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

    // Recuperar usuario para conocer rol
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

    // Rotar: revocar la sesión actual + emitir nueva
    if let Err(e) = sessions::revoke_session(db, session.id).await {
        warn!(error=%e, "no se pudo revocar sesión");
    }

    // El nuevo access NO es mfa_satisfied (refresh sólo regenera la sesión base).
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
struct LogoutReq {
    refresh_token: Option<String>,
}

async fn logout(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<LogoutReq>,
) -> axum::response::Response {
    // 1) blacklist del JTI del access token
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

    // 2) revocar refresh token si viene
    if let (Some(db), Some(rt)) = (&state.db, req.refresh_token.as_deref()) {
        if let Ok(Some(s)) = sessions::find_session(db, rt).await {
            let _ = sessions::revoke_session(db, s.id).await;
        }
    }

    (StatusCode::NO_CONTENT, ()).into_response()
}

// ===========================================================================
// ENGAGEMENT AUTHORIZE — H-CRIT-003
// ===========================================================================

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AuthorizeReq {
    recommendation_id: String,
    track_id: String,
    interceptors: Vec<String>,
    target_lat: f64,
    target_lon: f64,
    target_alt_m: f64,
    operator_id: String,
    /// Nonce server-side, single-use (Redis).
    mfa_proof: String,
    /// Token JWT con mfa_satisfied=true requerido.
    bearer_token: String,
    /// Nivel de autorización requerido (lo dicta OPA en la recomendación).
    #[serde(default)]
    authorization_level: Option<String>,
}

async fn authorize(
    State(state): State<AppState>,
    ConnectInfo(remote): ConnectInfo<SocketAddr>,
    Json(req): Json<AuthorizeReq>,
) -> axum::response::Response {
    // 1) Validar JWT + MFA + blacklist
    let claims = match state.jwt.verify(&req.bearer_token) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };
    if !claims.mfa_satisfied {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "MFA no satisfecho"})),
        )
            .into_response();
    }
    if let Some(redis) = &state.redis {
        if sessions::is_jti_blacklisted(redis, &claims.jti).await {
            metrics::metrics().jwt_blacklist_hits.with_label_values(&[]).inc();
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"token revocado"}))).into_response();
        }
    }

    // 2) mfa_proof single-use server-side (H-MED-008)
    if let Some(redis) = &state.redis {
        if !sessions::consume_mfa_proof(redis, &claims.sub, &req.mfa_proof).await {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "mfa_proof inválido o caducado"})),
            )
                .into_response();
        }
    } else if req.mfa_proof.len() < 64 || hex::decode(&req.mfa_proof).is_err() {
        // Fallback degradado si Redis no está disponible.
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "mfa_proof formato inválido"})),
        )
            .into_response();
    }

    // 3) Verificar rol vs authorization_level (H-CRIT-003)
    let required_level = req
        .authorization_level
        .as_deref()
        .unwrap_or("OFICIAL_TACTICO");
    let op_rank = role_rank(&claims.role);
    let req_rank = required_rank(required_level);
    if op_rank < req_rank {
        warn!(
            user = %claims.sub,
            role = %claims.role,
            required = %required_level,
            "intento de autorización con rol insuficiente"
        );
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "rol insuficiente",
                "operator_rank": op_rank,
                "required_rank": req_rank,
                "required_level": required_level
            })),
        )
            .into_response();
    }

    // 4) Validar que la recommendation_id existe en audit-log (H-CRIT-001 audit)
    if let Err(e) = verify_recommendation_exists(&state.audit_log_url, &req.recommendation_id).await {
        warn!(rec_id = %req.recommendation_id, error = %e, "rec_id no consta en audit-log");
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "recommendation_id no consta en audit-log",
                "detail": e
            })),
        )
            .into_response();
    }

    // 5) Publicar a Kafka engagement.authorized
    let event = serde_json::json!({
        "recommendation_id": req.recommendation_id,
        "track_id": req.track_id,
        "interceptors": req.interceptors,
        "target_lat": req.target_lat,
        "target_lon": req.target_lon,
        "target_alt_m": req.target_alt_m,
        "operator_id": req.operator_id,
        "operator_remote_ip": remote.ip().to_string(),
        "authorization_level": required_level,
    });
    let payload = event.to_string();
    if let Some(p) = &state.producer {
        let rec = FutureRecord::to("engagement.authorized")
            .key(&req.recommendation_id)
            .payload(payload.as_bytes());
        if let Err((e, _)) = p.send(rec, std::time::Duration::from_secs(5)).await {
            warn!(error = %e, "no se pudo publicar engagement.authorized");
        }
    }
    info!(rec = %req.recommendation_id, user = %req.operator_id, "engagement autorizado");
    metrics::metrics()
        .engagement_authorize
        .with_label_values(&["authorized"])
        .inc();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "authorized": true,
            "recommendation_id": req.recommendation_id,
            "publish_topic": "engagement.authorized"
        })),
    )
        .into_response()
}

/// Consulta al servicio audit-log para confirmar que la recommendation_id existe
/// en la cadena Merkle. Si no existe → rechazamos.
async fn verify_recommendation_exists(audit_url: &str, recommendation_id: &str) -> Result<(), String> {
    let url = format!("{audit_url}/v1/events?event_type=RECOMMENDATIONS&limit=500");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("audit-log respondió {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let events = body
        .get("events")
        .and_then(|v| v.as_array())
        .ok_or("audit-log respuesta inesperada")?;
    let found = events.iter().any(|e| {
        e.get("payload")
            .and_then(|p| p.get("recommendation_id"))
            .and_then(|v| v.as_str())
            == Some(recommendation_id)
    });
    if found {
        Ok(())
    } else {
        Err("recommendation_id no encontrado".into())
    }
}

/// Si detecta el hash dummy generado en la migración 004 (Argon2 con m=4096),
/// genera un hash OWASP (m=65536) para "demo_changeme" y lo actualiza.
/// Idempotente: si el hash ya está actualizado, no hace nada.
async fn ensure_demo_password_argon2_owasp(pool: &PgPool) -> anyhow::Result<()> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT password_hash FROM users WHERE username = 'operador_demo' LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    let needs_reseed = match &row {
        Some((h,)) => h.contains("m=4096") || !h.starts_with("$argon2id$") || !auth::verify_password("demo_changeme", h),
        None => false,
    };
    if !needs_reseed {
        return Ok(());
    }
    let new_hash = auth::hash_password("demo_changeme")?;
    sqlx::query("UPDATE users SET password_hash = $1, updated_at = now() WHERE username = 'operador_demo'")
        .bind(&new_hash)
        .execute(pool)
        .await?;
    warn!("PoC demo password rehashed con Argon2id OWASP (m=65536, t=3, p=4)");
    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,hmi_gateway=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .init();
}
