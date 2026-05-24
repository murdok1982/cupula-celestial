//! Wrapper alrededor de rdkafka. Soporta modo degradado (sin Kafka) para dev/tests.

use std::time::Duration;

use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use tracing::{debug, error, warn};

pub enum Producer {
    Real(FutureProducer),
    Degraded,
}

impl Producer {
    pub fn new(brokers: &str, client_id: &str) -> Result<Self, rdkafka::error::KafkaError> {
        let p: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("client.id", client_id)
            .set("message.timeout.ms", "5000")
            .set("compression.type", "lz4")
            .set("enable.idempotence", "true")
            .set("acks", "all")
            .create()?;
        Ok(Producer::Real(p))
    }

    pub fn degraded() -> Self {
        Producer::Degraded
    }

    pub async fn publish(
        &self,
        topic: &str,
        key: &str,
        payload: &[u8],
    ) -> Result<(), String> {
        match self {
            Producer::Real(p) => {
                let rec = FutureRecord::to(topic).key(key).payload(payload);
                match p.send(rec, Duration::from_secs(5)).await {
                    Ok(d) => {
                        debug!(topic, partition = d.0, offset = d.1, "publicado");
                        Ok(())
                    }
                    Err((e, _msg)) => {
                        error!(topic, error = %e, "fallo publicación Kafka");
                        Err(e.to_string())
                    }
                }
            }
            Producer::Degraded => {
                warn!(topic, key, "modo degradado: payload no publicado");
                Ok(())
            }
        }
    }
}
