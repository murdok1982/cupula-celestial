//! swarm-controller: WTA + envío MAVLink. Consume `engagement.authorized` y emite comandos.

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::{ClientConfig, Message};
use serde::Deserialize;
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use swarm_controller::api;
use swarm_controller::auth::InternalAuth;
use swarm_controller::mavlink_send::MavlinkClient;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AuthorizedEngagement {
    recommendation_id: String,
    track_id: String,
    interceptors: Vec<String>,
    target_lat: f64,
    target_lon: f64,
    target_alt_m: f64,
    operator_id: String,
    #[serde(default)]
    authorization_level: Option<String>,
    #[serde(default)]
    operator_remote_ip: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let bind: SocketAddr = std::env::var("SWARM_BIND")
        .unwrap_or_else(|_| "0.0.0.0:9200".into())
        .parse()
        .context("SWARM_BIND inválido")?;
    let mav_target =
        std::env::var("MAVLINK_TARGET").unwrap_or_else(|_| "drone-simulator:14550".into());
    let brokers = std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "redpanda:9092".into());
    let audit_log_url =
        std::env::var("AUDIT_LOG_URL").unwrap_or_else(|_| "http://audit-log:9300".into());

    let mavlink = Arc::new(MavlinkClient::new(&mav_target));
    let internal_auth = InternalAuth::from_env();

    // Spawn Kafka consumer en background
    let mavlink_consumer = mavlink.clone();
    tokio::spawn(async move {
        match ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("group.id", "swarm-controller")
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "earliest")
            .create::<StreamConsumer>()
        {
            Ok(c) => {
                if let Err(e) = c.subscribe(&["engagement.authorized"]) {
                    warn!(error = %e, "no se pudo suscribir a engagement.authorized");
                    return;
                }
                info!("consuming engagement.authorized");
                loop {
                    match c.recv().await {
                        Ok(m) => {
                            if let Some(payload) = m.payload() {
                                match serde_json::from_slice::<AuthorizedEngagement>(payload) {
                                    Ok(ev) => {
                                        info!(rec_id = %ev.recommendation_id, "autorización recibida; enviando MAVLink");
                                        for (idx, ic) in ev.interceptors.iter().enumerate() {
                                            let sys_id = ((idx as u8) % 200).saturating_add(1);
                                            if let Err(e) = mavlink_consumer.send_engage_waypoint(
                                                sys_id,
                                                1,
                                                ev.target_lat,
                                                ev.target_lon,
                                                ev.target_alt_m as f32,
                                            ) {
                                                warn!(interceptor = %ic, error = %e, "fallo envío MAVLink");
                                            }
                                        }
                                    }
                                    Err(e) => warn!(error = %e, "payload engagement.authorized inválido"),
                                }
                            }
                        }
                        Err(e) => warn!(error = %e, "kafka recv"),
                    }
                }
            }
            Err(e) => warn!(error = %e, "kafka consumer no disponible; sólo API HTTP"),
        }
    });

    let state = api::AppState {
        mavlink: mavlink.clone(),
        internal_auth: internal_auth.clone(),
        audit_log_url,
    };
    let app = api::router(state);

    info!(%bind, "swarm-controller listening (HMAC+JWT internal auth enforced)");
    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,swarm_controller=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .init();
}
