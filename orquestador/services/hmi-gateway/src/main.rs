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
mod handlers;
mod hmac_internal;
mod metrics;
mod routes;
mod security_headers;
mod state;
mod ws;
#[cfg(test)]
mod tests;

use std::net::SocketAddr;
use std::sync::Arc;

use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::producer::FutureProducer;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::signal;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use crate::auth::{
    fido2_real_verify_enabled, webauthn as wa,
};
use crate::state::AppState;
use crate::ws::WsHub;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

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

    let jwt = Arc::new(auth::JwtKeys::from_env().unwrap_or_else(|e| {
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

    if let Some(pool) = &db {
        if let Err(e) = ensure_demo_password_argon2_owasp(pool).await {
            warn!(error = %e, "no se pudo reseed del demo password");
        }
    }

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

    let app = routes::build(state, hub.clone());

    info!(%bind, "hmi-gateway listening");

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
