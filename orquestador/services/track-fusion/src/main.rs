//! track-fusion: consume `sensors.raw`, corre IMM/JPDAF y publica `tracks.confirmed`.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, Utc};
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::{ClientConfig, Message};
use serde::Deserialize;
use tokio::sync::Mutex;
use tokio::time::interval;
use tracing::{debug, info, warn};
use tracing_subscriber::EnvFilter;

use track_fusion::publisher::TrackPublisher;
use track_fusion::tracker::{TrackManager, TrackerConfig};
use track_fusion::types::SensorObservation;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SensorReadingIn {
    sensor_id: String,
    sensor_type: String,
    timestamp: DateTime<Utc>,
    position: PositionIn,
    detection: DetectionIn,
    snr_db: f64,
    quality: f64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PositionIn {
    latitude: f64,
    longitude: f64,
    altitude_msl_m: f64,
    altitude_agl_m: f64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DetectionIn {
    range_m: f64,
    azimuth_deg: f64,
    elevation_deg: f64,
    doppler_mps: f64,
    rcs_dbsm: f64,
    #[serde(default)]
    spectrum_signature: Option<String>,
    #[serde(default)]
    micro_doppler_period_ms: Option<f64>,
    #[serde(default)]
    feature_vector: Vec<f32>,
}

impl SensorReadingIn {
    fn to_obs(&self, ref_lat: f64, ref_lon: f64) -> SensorObservation {
        // ENU local plano. Para PoC usamos aproximación equirectangular alrededor del ref.
        let (lat0, lon0) = (ref_lat.to_radians(), ref_lon.to_radians());
        let earth_r = 6_378_137.0_f64;
        let dlat = self.position.latitude.to_radians() - lat0;
        let dlon = self.position.longitude.to_radians() - lon0;
        let x = earth_r * dlon * lat0.cos();
        let y = earth_r * dlat;
        let z = self.position.altitude_msl_m;
        SensorObservation {
            sensor_id: self.sensor_id.clone(),
            sensor_type: self.sensor_type.clone(),
            timestamp: self.timestamp,
            enu_xyz_m: [x, y, z],
            latitude: self.position.latitude,
            longitude: self.position.longitude,
            altitude_msl_m: self.position.altitude_msl_m,
            altitude_agl_m: self.position.altitude_agl_m,
            snr_db: self.snr_db,
            quality: self.quality,
            doppler_mps: self.detection.doppler_mps,
            rcs_dbsm: self.detection.rcs_dbsm,
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let brokers =
        std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "redpanda:9092".to_string());
    let confirm_m: u32 = std::env::var("TRACK_CONFIRM_M")
        .unwrap_or_else(|_| "3".into())
        .parse()
        .context("TRACK_CONFIRM_M")?;
    let confirm_n: u32 = std::env::var("TRACK_CONFIRM_N")
        .unwrap_or_else(|_| "5".into())
        .parse()
        .context("TRACK_CONFIRM_N")?;

    let consumer: StreamConsumer = match ClientConfig::new()
        .set("bootstrap.servers", &brokers)
        .set("group.id", "track-fusion")
        .set("enable.auto.commit", "true")
        .set("auto.offset.reset", "earliest")
        .set("session.timeout.ms", "6000")
        .create()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "no Kafka disponible; modo degradado");
            run_degraded().await?;
            return Ok(());
        }
    };

    consumer
        .subscribe(&["sensors.raw"])
        .context("subscribe sensors.raw")?;

    let publisher = match TrackPublisher::new(&brokers) {
        Ok(p) => p,
        Err(e) => {
            warn!(error = %e, "publisher Kafka no disponible; modo degradado");
            TrackPublisher::degraded()
        }
    };

    let manager = Arc::new(Mutex::new(TrackManager::new(TrackerConfig {
        confirm_m,
        confirm_n,
        gate: 25.0,
    })));
    let publisher = Arc::new(publisher);

    info!("track-fusion listening on Kafka topic sensors.raw");

    // Tarea de flush periódico para tracks que no recibieron observación
    let mgr_clone = manager.clone();
    let pub_clone = publisher.clone();
    tokio::spawn(async move {
        let mut tick = interval(Duration::from_millis(500));
        loop {
            tick.tick().await;
            let snapshot: Vec<_> = {
                let m = mgr_clone.lock().await;
                m.tracks.values().map(|t| t.to_status()).collect()
            };
            for s in snapshot {
                let _ = pub_clone.publish(&s).await;
            }
        }
    });

    // Buffer simple: agrupar observaciones en ventanas de 100 ms para batch step.
    let mut buffer: Vec<SensorObservation> = Vec::new();
    let mut last_flush = std::time::Instant::now();
    let ref_lat: f64 = 40.416; // Madrid Sol como referencia ENU PoC
    let ref_lon: f64 = -3.704;

    loop {
        tokio::select! {
            msg = consumer.recv() => {
                match msg {
                    Ok(m) => {
                        if let Some(payload) = m.payload() {
                            match serde_json::from_slice::<SensorReadingIn>(payload) {
                                Ok(reading) => {
                                    buffer.push(reading.to_obs(ref_lat, ref_lon));
                                }
                                Err(e) => warn!(error = %e, "payload sensor inválido"),
                            }
                        }
                    }
                    Err(e) => warn!(error = %e, "kafka recv error"),
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(150)) => {}
        }

        if last_flush.elapsed() >= Duration::from_millis(100) && !buffer.is_empty() {
            let obs = std::mem::take(&mut buffer);
            let statuses = {
                let mut m = manager.lock().await;
                m.step(&obs)
            };
            for s in statuses {
                let _ = publisher.publish(&s).await;
            }
            last_flush = std::time::Instant::now();
            debug!("flushed batch");
        }
    }
}

async fn run_degraded() -> anyhow::Result<()> {
    warn!("track-fusion en modo degradado: no consume Kafka");
    // Mantener proceso vivo para healthchecks de orquestador
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,track_fusion=debug"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .with_target(true)
        .init();
}

