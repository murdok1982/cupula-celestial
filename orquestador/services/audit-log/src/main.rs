//! audit-log: consume topics críticos y persiste en cadena Merkle append-only.
//!
//! FASE 2:
//!  - Firmado de batches Merkle con HSM (default SoftHSM Ed25519, opcional PKCS#11).
//!  - `/v1/verify_chain` verifica firmas de batches además del hash chain.
//!  - `/metrics` Prometheus.
//!  - mTLS opcional vía env TLS_CERT_PATH/TLS_KEY_PATH/TLS_CA_PATH.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::Message;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::signal;
use tokio::sync::Mutex;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use audit_log::hsm::{build_signer_from_env, verify_ed25519, HsmSigner};
use audit_log::merkle::{AuditEvent, GENESIS_HASH};

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    #[allow(dead_code)]
    last_hash: Arc<Mutex<String>>,
    #[allow(dead_code)]
    signer: Arc<dyn HsmSigner>,
}

const BATCH_INTERVAL_SECS: u64 = 30;
const BATCH_MAX_EVENTS: i64 = 256;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let bind: SocketAddr = "0.0.0.0:9300".parse()?;
    // H-ALT-007: nunca fallback hardcoded de credenciales. Falla cerrado.
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL requerido (fallback hardcoded eliminado)"))?;

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .map_err(|e| {
            warn!(error = %e, "no se pudo conectar a Postgres; arrancando en degraded");
            e
        })?;

    // FASE 2: HSM signer (default SoftHSM Ed25519).
    let signer_box = build_signer_from_env().map_err(|e| {
        anyhow::anyhow!("FATAL: HSM signer no inicializa ({e}). Revisar HSM_BACKEND.")
    })?;
    let signer: Arc<dyn HsmSigner> = Arc::from(signer_box);
    info!(
        algo = %signer.algorithm(),
        key_id = %signer.key_id(),
        "HSM signer inicializado"
    );
    // Registrar pubkey en audit_signing_keys (idempotente).
    let _ = sqlx::query(
        r#"INSERT INTO audit_signing_keys (key_id, public_key, algorithm)
           VALUES ($1, $2, $3)
           ON CONFLICT (key_id) DO NOTHING"#,
    )
    .bind(signer.key_id())
    .bind(signer.pubkey())
    .bind(signer.algorithm())
    .execute(&pool)
    .await;

    // Recuperar último hash de la cadena
    let last_hash = match sqlx::query_scalar::<_, String>(
        "SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(h)) => h,
        _ => GENESIS_HASH.to_string(),
    };
    let last_hash = Arc::new(Mutex::new(last_hash));

    let state = AppState {
        pool: pool.clone(),
        last_hash: last_hash.clone(),
        signer: signer.clone(),
    };

    // Consumer de topics críticos
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "redpanda:9092".into());
    let pool_clone = pool.clone();
    let last_hash_clone = last_hash.clone();
    tokio::spawn(async move {
        let mut cfg = ClientConfig::new();
        cfg.set("bootstrap.servers", &brokers)
            .set("group.id", "audit-log")
            .set("auto.offset.reset", "earliest");
        apply_kafka_sasl_config(&mut cfg);
        let c: StreamConsumer = match cfg.create() {
            Ok(c) => c,
            Err(e) => {
                warn!(error = %e, "kafka no disponible para audit-log");
                return;
            }
        };
        let topics = [
            "tracks.confirmed",
            "tracks.classified",
            "recommendations",
            "engagement.authorized",
            "engagement.commanded",
            "alerts",
        ];
        if let Err(e) = c.subscribe(&topics) {
            warn!(error = %e, "no se pudo subscribirse en audit-log");
            return;
        }
        info!(?topics, "audit-log consumiendo");
        loop {
            if let Ok(m) = c.recv().await {
                let topic = m.topic().to_string();
                if let Some(payload) = m.payload() {
                    let val: serde_json::Value = serde_json::from_slice(payload)
                        .unwrap_or_else(|_| serde_json::Value::String("invalid_json".into()));
                    let mut prev = last_hash_clone.lock().await;
                    let evt = AuditEvent::new(&topic.to_uppercase(), &topic, val, &prev);
                    let res = sqlx::query(
                        r#"INSERT INTO audit_log (event_id, event_type, event_time, actor, payload, prev_hash, hash)
                           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
                           ON CONFLICT (hash) DO NOTHING"#,
                    )
                    .bind(&evt.event_id)
                    .bind(&evt.event_type)
                    .bind(evt.event_time)
                    .bind(&evt.actor)
                    .bind(&evt.payload)
                    .bind(&evt.prev_hash)
                    .bind(&evt.hash)
                    .execute(&pool_clone)
                    .await;
                    match res {
                        Ok(_) => {
                            *prev = evt.hash;
                        }
                        Err(e) => warn!(error = %e, topic, "fallo insert audit_log"),
                    }
                }
            }
        }
    });

    // FASE 2: batch signer task (cada BATCH_INTERVAL_SECS o BATCH_MAX_EVENTS eventos).
    let pool_b = pool.clone();
    let signer_b = signer.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(BATCH_INTERVAL_SECS));
        loop {
            interval.tick().await;
            if let Err(e) = build_and_sign_pending_batch(&pool_b, signer_b.as_ref()).await {
                warn!(error = %e, "batch signer error");
            }
        }
    });

    let app: Router = Router::new()
        .route("/health", get(health))
        .route("/v1/verify_chain", get(verify_chain_handler))
        .route("/v1/events", get(list_events))
        .route("/v1/batches", get(list_batches))
        .route("/v1/signing_keys", get(list_signing_keys))
        .route("/metrics", get(metrics_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    info!(%bind, "audit-log listening");

    // FASE 2: TLS opcional via rustls.
    if let Some(bundle) = load_tls_from_env() {
        info!("audit-log: mTLS habilitado (rustls).");
        let server_config = build_rustls_server_config(bundle)?;
        let rustls_cfg =
            axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(server_config));
        axum_server::bind_rustls(bind, rustls_cfg)
            .serve(app.into_make_service())
            .await?;
    } else {
        let listener = tokio::net::TcpListener::bind(bind).await?;
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = signal::ctrl_c().await;
            })
            .await?;
    }
    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok", "service": "audit-log"}))
}

async fn verify_chain_handler(State(state): State<AppState>) -> impl IntoResponse {
    // 1) Hash chain integrity
    let rows = match sqlx::query_as::<_, (i64, String, String)>(
        "SELECT seq, prev_hash, hash FROM audit_log ORDER BY seq ASC",
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };
    let mut prev = GENESIS_HASH.to_string();
    for (seq, ph, h) in &rows {
        if *ph != prev {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "valid": false,
                    "broken_at_seq": seq,
                    "expected_prev_hash": prev,
                    "actual_prev_hash": ph,
                    "stage": "hash_chain",
                })),
            )
                .into_response();
        }
        prev = h.clone();
    }

    // 2) Batch signatures
    let batches: Vec<(uuid::Uuid, i64, i64, String, Vec<u8>, String)> = match sqlx::query_as(
        "SELECT batch_id, seq_start, seq_end, batch_root, batch_signature, signing_key_id
         FROM audit_batches ORDER BY seq_start ASC",
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(_) => Vec::new(),
    };
    let mut invalid_batches = Vec::new();
    for (batch_id, seq_start, seq_end, batch_root, sig, key_id) in &batches {
        // Cargar pubkey de signing_keys
        let pk: Option<(Vec<u8>,)> =
            sqlx::query_as("SELECT public_key FROM audit_signing_keys WHERE key_id = $1")
                .bind(key_id)
                .fetch_optional(&state.pool)
                .await
                .ok()
                .flatten();
        let Some((pubkey,)) = pk else {
            invalid_batches.push(serde_json::json!({
                "batch_id": batch_id,
                "reason": "pubkey not found",
                "key_id": key_id
            }));
            continue;
        };
        // Recalcular batch_root desde la BD (anti-tamper)
        let recomputed = compute_batch_root_from_pool(&state.pool, *seq_start, *seq_end)
            .await
            .unwrap_or_default();
        if recomputed != *batch_root {
            invalid_batches.push(serde_json::json!({
                "batch_id": batch_id,
                "reason": "batch_root mismatch — eventos manipulados",
                "stored": batch_root,
                "recomputed": recomputed,
            }));
            continue;
        }
        if !verify_ed25519(&pubkey, batch_root.as_bytes(), sig) {
            invalid_batches.push(serde_json::json!({
                "batch_id": batch_id,
                "reason": "firma inválida"
            }));
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "valid": invalid_batches.is_empty(),
            "total_events": rows.len(),
            "last_hash": prev,
            "total_batches": batches.len(),
            "invalid_batches": invalid_batches,
        })),
    )
        .into_response()
}

async fn list_batches(State(state): State<AppState>) -> impl IntoResponse {
    let rows: Vec<(uuid::Uuid, i64, i64, String, i32, chrono::DateTime<chrono::Utc>, String)> =
        match sqlx::query_as(
            "SELECT batch_id, seq_start, seq_end, batch_root, event_count, created_at, signing_key_id
             FROM audit_batches ORDER BY seq_start DESC LIMIT 100",
        )
        .fetch_all(&state.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        };
    let arr: Vec<_> = rows
        .into_iter()
        .map(|(id, s, e, root, count, t, k)| {
            serde_json::json!({
                "batch_id": id,
                "seq_start": s,
                "seq_end": e,
                "batch_root": root,
                "event_count": count,
                "created_at": t,
                "signing_key_id": k,
            })
        })
        .collect();
    (StatusCode::OK, Json(serde_json::json!({"batches": arr}))).into_response()
}

async fn list_signing_keys(State(state): State<AppState>) -> impl IntoResponse {
    let rows: Vec<(String, Vec<u8>, String, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> =
        match sqlx::query_as(
            "SELECT key_id, public_key, algorithm, activated_at, retired_at
             FROM audit_signing_keys ORDER BY activated_at DESC",
        )
        .fetch_all(&state.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        };
    let arr: Vec<_> = rows
        .into_iter()
        .map(|(k, pk, alg, a, r)| {
            serde_json::json!({
                "key_id": k,
                "public_key_hex": hex::encode(pk),
                "algorithm": alg,
                "activated_at": a,
                "retired_at": r,
            })
        })
        .collect();
    (StatusCode::OK, Json(serde_json::json!({"keys": arr}))).into_response()
}

async fn metrics_handler(State(state): State<AppState>) -> impl IntoResponse {
    // Métricas básicas Prometheus en formato text.
    let total_events: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let total_batches: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_batches")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    let body = format!(
        "# HELP cupula_audit_events_total Total audit events persisted\n\
         # TYPE cupula_audit_events_total counter\n\
         cupula_audit_events_total {events}\n\
         # HELP cupula_audit_batches_total Total signed batches\n\
         # TYPE cupula_audit_batches_total counter\n\
         cupula_audit_batches_total {batches}\n",
        events = total_events,
        batches = total_batches,
    );
    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        body,
    )
        .into_response()
}

#[derive(Deserialize)]
struct ListQuery {
    limit: Option<i64>,
    event_type: Option<String>,
}

#[derive(sqlx::FromRow)]
struct AuditRow {
    seq: i64,
    event_id: String,
    event_type: String,
    event_time: chrono::DateTime<chrono::Utc>,
    actor: String,
    payload: serde_json::Value,
    prev_hash: String,
    hash: String,
}

async fn list_events(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    let rows = if let Some(t) = q.event_type {
        sqlx::query_as::<_, AuditRow>(
            "SELECT seq, event_id::text AS event_id, event_type, event_time, actor, payload, prev_hash, hash
             FROM audit_log WHERE event_type = $1 ORDER BY seq DESC LIMIT $2",
        )
        .bind(t)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
    } else {
        sqlx::query_as::<_, AuditRow>(
            "SELECT seq, event_id::text AS event_id, event_type, event_time, actor, payload, prev_hash, hash
             FROM audit_log ORDER BY seq DESC LIMIT $1",
        )
        .bind(limit)
        .fetch_all(&state.pool)
        .await
    };
    match rows {
        Ok(r) => {
            let arr: Vec<_> = r
                .into_iter()
                .map(|row| {
                    serde_json::json!({
                        "seq": row.seq,
                        "event_id": row.event_id,
                        "event_type": row.event_type,
                        "event_time": row.event_time,
                        "actor": row.actor,
                        "payload": row.payload,
                        "prev_hash": row.prev_hash,
                        "hash": row.hash
                    })
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({"events": arr}))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===========================================================================
// Batch signing helpers
// ===========================================================================

/// Construye y firma un batch con todos los eventos no firmados todavía.
async fn build_and_sign_pending_batch(pool: &PgPool, signer: &dyn HsmSigner) -> anyhow::Result<()> {
    let last_signed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(seq_end), 0) FROM audit_batches",
    )
    .fetch_one(pool)
    .await?;
    let head: Option<i64> = sqlx::query_scalar::<_, Option<i64>>("SELECT MAX(seq) FROM audit_log")
        .fetch_one(pool)
        .await?;
    let head = match head {
        Some(h) => h,
        None => return Ok(()),
    };
    if head <= last_signed {
        return Ok(());
    }
    let seq_start = last_signed + 1;
    let seq_end = std::cmp::min(head, last_signed + BATCH_MAX_EVENTS);

    let batch_root = compute_batch_root_from_pool(pool, seq_start, seq_end).await?;
    let sig = signer.sign(batch_root.as_bytes())?;
    let event_count = (seq_end - seq_start + 1) as i32;

    sqlx::query(
        r#"INSERT INTO audit_batches
           (seq_start, seq_end, batch_root, batch_signature, signing_key_id, algorithm, event_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(seq_start)
    .bind(seq_end)
    .bind(&batch_root)
    .bind(&sig)
    .bind(signer.key_id())
    .bind(signer.algorithm())
    .bind(event_count)
    .execute(pool)
    .await?;
    info!(seq_start, seq_end, count = event_count, "audit batch signed");
    Ok(())
}

async fn compute_batch_root_from_pool(
    pool: &PgPool,
    seq_start: i64,
    seq_end: i64,
) -> anyhow::Result<String> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT hash FROM audit_log WHERE seq BETWEEN $1 AND $2 ORDER BY seq ASC",
    )
    .bind(seq_start)
    .bind(seq_end)
    .fetch_all(pool)
    .await?;
    let mut h = Sha256::new();
    for (hash,) in rows {
        h.update(hash.as_bytes());
    }
    Ok(hex::encode(h.finalize()))
}

// ===========================================================================
// Kafka SASL + TLS aplicado a cualquier ClientConfig
// ===========================================================================

fn apply_kafka_sasl_config(cfg: &mut ClientConfig) {
    if let Ok(sec) = std::env::var("KAFKA_SECURITY_PROTOCOL") {
        cfg.set("security.protocol", &sec);
    }
    if let Ok(mech) = std::env::var("KAFKA_SASL_MECHANISM") {
        cfg.set("sasl.mechanism", &mech);
    }
    if let Ok(user) = std::env::var("KAFKA_SASL_USERNAME") {
        cfg.set("sasl.username", &user);
    }
    if let Ok(pw) = std::env::var("KAFKA_SASL_PASSWORD") {
        cfg.set("sasl.password", &pw);
    }
    if let Ok(ca) = std::env::var("KAFKA_SSL_CA_LOCATION") {
        cfg.set("ssl.ca.location", &ca);
    }
    if let Ok(cert) = std::env::var("KAFKA_SSL_CERT_LOCATION") {
        cfg.set("ssl.certificate.location", &cert);
    }
    if let Ok(key) = std::env::var("KAFKA_SSL_KEY_LOCATION") {
        cfg.set("ssl.key.location", &key);
    }
}

// ===========================================================================
// TLS helpers (local — evita dependencia cruzada con hmi-gateway)
// ===========================================================================

struct TlsBundle {
    cert_chain: Vec<rustls::pki_types::CertificateDer<'static>>,
    key: rustls::pki_types::PrivateKeyDer<'static>,
    ca_certs: Vec<rustls::pki_types::CertificateDer<'static>>,
    require_client_cert: bool,
}

fn load_tls_from_env() -> Option<TlsBundle> {
    let cert_p = std::env::var("TLS_CERT_PATH").ok()?;
    let key_p = std::env::var("TLS_KEY_PATH").ok()?;
    let ca_p = std::env::var("TLS_CA_PATH").ok();
    let require_client_cert = std::env::var("MTLS_REQUIRE_CLIENT_CERT")
        .map(|s| matches!(s.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false);

    let cert_chain = load_certs(&cert_p).ok()?;
    let key = load_key(&key_p).ok()?;
    let ca_certs = ca_p
        .and_then(|p| load_certs(&p).ok())
        .unwrap_or_default();
    Some(TlsBundle {
        cert_chain,
        key,
        ca_certs,
        require_client_cert,
    })
}

fn load_certs(path: &str) -> anyhow::Result<Vec<rustls::pki_types::CertificateDer<'static>>> {
    let f = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(f);
    let certs: Vec<_> = rustls_pemfile::certs(&mut reader)
        .filter_map(|r| r.ok())
        .collect();
    Ok(certs)
}

fn load_key(path: &str) -> anyhow::Result<rustls::pki_types::PrivateKeyDer<'static>> {
    let f = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(f);
    rustls_pemfile::private_key(&mut reader)?
        .ok_or_else(|| anyhow::anyhow!("sin private key"))
}

fn build_rustls_server_config(bundle: TlsBundle) -> anyhow::Result<rustls::ServerConfig> {
    let config = if bundle.require_client_cert && !bundle.ca_certs.is_empty() {
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
    Ok(config)
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,audit_log=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .init();
}
