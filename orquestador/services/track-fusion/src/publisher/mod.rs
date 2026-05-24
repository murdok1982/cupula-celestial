//! Publica tracks confirmados al topic Kafka `tracks.confirmed`.

use std::time::Duration;

use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use tracing::{debug, error, warn};

use crate::types::TrackStatus;

pub enum TrackPublisher {
    Real(FutureProducer),
    Degraded,
}

impl TrackPublisher {
    pub fn new(brokers: &str) -> Result<Self, rdkafka::error::KafkaError> {
        let p = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("client.id", "track-fusion")
            .set("compression.type", "lz4")
            .set("acks", "all")
            .set("message.timeout.ms", "5000")
            .create()?;
        Ok(TrackPublisher::Real(p))
    }

    pub fn degraded() -> Self {
        TrackPublisher::Degraded
    }

    pub async fn publish(&self, status: &TrackStatus) -> Result<(), String> {
        if !status.confirmed {
            return Ok(()); // no publicamos tentativos
        }
        let payload = serde_json::to_vec(status).map_err(|e| e.to_string())?;
        match self {
            TrackPublisher::Real(p) => {
                let rec = FutureRecord::to("tracks.confirmed")
                    .key(&status.track_id)
                    .payload(&payload);
                match p.send(rec, Duration::from_secs(5)).await {
                    Ok(d) => {
                        debug!(
                            track_id = %status.track_id,
                            partition = d.0,
                            offset = d.1,
                            "track confirmado publicado"
                        );
                        Ok(())
                    }
                    Err((e, _)) => {
                        error!(error = %e, "fallo publicación track");
                        Err(e.to_string())
                    }
                }
            }
            TrackPublisher::Degraded => {
                warn!(
                    track_id = %status.track_id,
                    "modo degradado: track no publicado"
                );
                Ok(())
            }
        }
    }
}
