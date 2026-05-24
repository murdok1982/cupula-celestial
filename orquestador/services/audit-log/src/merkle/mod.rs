//! Cadena hash tipo Merkle (one-chain). Cada evento contiene `prev_hash` y `hash`.
//! hash = SHA256(prev_hash || canonical_json(payload) || event_id || event_type || event_time).
//!
//! Mantiene integridad append-only verificable.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const GENESIS_HASH: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub event_id: String,
    pub event_type: String,
    pub event_time: DateTime<Utc>,
    pub actor: String,
    pub payload: serde_json::Value,
    pub prev_hash: String,
    pub hash: String,
}

impl AuditEvent {
    pub fn compute_hash(
        event_id: &str,
        event_type: &str,
        event_time: DateTime<Utc>,
        actor: &str,
        payload: &serde_json::Value,
        prev_hash: &str,
    ) -> String {
        // JSON canonicalizado: ordenar claves recursivamente.
        let canonical = canonicalize(payload);
        let mut h = Sha256::new();
        h.update(prev_hash.as_bytes());
        h.update(b"|");
        h.update(event_id.as_bytes());
        h.update(b"|");
        h.update(event_type.as_bytes());
        h.update(b"|");
        h.update(event_time.timestamp_nanos_opt().unwrap_or(0).to_be_bytes());
        h.update(b"|");
        h.update(actor.as_bytes());
        h.update(b"|");
        h.update(canonical.as_bytes());
        hex::encode(h.finalize())
    }

    pub fn new(
        event_type: &str,
        actor: &str,
        payload: serde_json::Value,
        prev_hash: &str,
    ) -> Self {
        let event_id = uuid::Uuid::new_v4().to_string();
        let event_time = Utc::now();
        let hash = Self::compute_hash(&event_id, event_type, event_time, actor, &payload, prev_hash);
        Self {
            event_id,
            event_type: event_type.into(),
            event_time,
            actor: actor.into(),
            payload,
            prev_hash: prev_hash.into(),
            hash,
        }
    }
}

/// Canonicaliza un valor JSON (claves ordenadas, sin espacios).
fn canonicalize(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut s = String::from("{");
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }
                s.push('"');
                s.push_str(&k.replace('\\', "\\\\").replace('"', "\\\""));
                s.push('"');
                s.push(':');
                s.push_str(&canonicalize(&map[*k]));
            }
            s.push('}');
            s
        }
        serde_json::Value::Array(arr) => {
            let mut s = String::from("[");
            for (i, e) in arr.iter().enumerate() {
                if i > 0 {
                    s.push(',');
                }
                s.push_str(&canonicalize(e));
            }
            s.push(']');
            s
        }
        other => other.to_string(),
    }
}

/// Verifica integridad de una cadena.
pub fn verify_chain(events: &[AuditEvent]) -> Option<(usize, String, String)> {
    let mut prev = GENESIS_HASH.to_string();
    for (i, e) in events.iter().enumerate() {
        if e.prev_hash != prev {
            return Some((i, prev, e.prev_hash.clone()));
        }
        let recomputed = AuditEvent::compute_hash(
            &e.event_id,
            &e.event_type,
            e.event_time,
            &e.actor,
            &e.payload,
            &e.prev_hash,
        );
        if recomputed != e.hash {
            return Some((i, e.hash.clone(), recomputed));
        }
        prev = e.hash.clone();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn chain_grows_and_verifies() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..10 {
            let e = AuditEvent::new(
                "TRACK_CONFIRMED",
                "track-fusion",
                json!({"track_id": format!("T-{i}")}),
                &prev,
            );
            prev = e.hash.clone();
            events.push(e);
        }
        assert!(verify_chain(&events).is_none());
    }

    #[test]
    fn tamper_detected() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..5 {
            let e = AuditEvent::new("X", "actor", json!({"k": i}), &prev);
            prev = e.hash.clone();
            events.push(e);
        }
        // Manipular payload del medio sin recalcular
        events[2].payload = json!({"k": 999});
        let res = verify_chain(&events);
        assert!(res.is_some(), "se esperaba detectar manipulación");
    }

    #[test]
    fn canonical_json_is_deterministic() {
        let a = json!({"b": 1, "a": [3, 2, 1]});
        let b = json!({"a": [3, 2, 1], "b": 1});
        assert_eq!(canonicalize(&a), canonicalize(&b));
    }

    #[test]
    fn test_verify_chain_valid() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..5 {
            let e = AuditEvent::new(
                "TRACK_CONFIRMED",
                "track-fusion",
                json!({"track_id": format!("T-{i}"), "seq": i}),
                &prev,
            );
            prev = e.hash.clone();
            events.push(e);
        }
        assert!(verify_chain(&events).is_none(), "cadena valida debe verificar");
    }

    #[test]
    fn test_verify_chain_tampered_middle() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..5 {
            let e = AuditEvent::new("X", "actor", json!({"k": i}), &prev);
            prev = e.hash.clone();
            events.push(e);
        }
        events[2].payload = json!({"k": 9999});
        let res = verify_chain(&events);
        assert!(res.is_some(), "debe detectar manipulacion en el medio");
    }

    #[test]
    fn test_verify_chain_tampered_latest() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..5 {
            let e = AuditEvent::new("X", "actor", json!({"k": i}), &prev);
            prev = e.hash.clone();
            events.push(e);
        }
        events[4].payload = json!({"k": 9999});
        let res = verify_chain(&events);
        assert!(res.is_some(), "debe detectar manipulacion en el ultimo");
    }

    #[test]
    fn test_verify_chain_empty() {
        let events: Vec<AuditEvent> = Vec::new();
        let res = verify_chain(&events);
        assert!(res.is_none(), "cadena vacia debe verificar (None)");
    }

    #[test]
    fn test_batch_signing() {
        let mut prev = GENESIS_HASH.to_string();
        let mut events = Vec::new();
        for i in 0..10 {
            let e = AuditEvent::new(
                "RECOMMENDATIONS",
                "decision-engine",
                json!({"rec_id": format!("R-{i}"), "target": format!("T-{i}")}),
                &prev,
            );
            prev = e.hash.clone();
            events.push(e);
        }
        assert!(verify_chain(&events).is_none());
        let mut h = sha2::Sha256::new();
        for e in &events {
            h.update(e.hash.as_bytes());
        }
        let batch_root = hex::encode(h.finalize());
        assert!(!batch_root.is_empty(), "batch root no debe estar vacio");
        assert_eq!(batch_root.len(), 64);
    }

    #[test]
    fn test_multiple_batches_integrity() {
        let mut batch1 = Vec::new();
        let mut prev = GENESIS_HASH.to_string();
        for i in 0..3 {
            let e = AuditEvent::new("BATCH1", "svc", json!({"seq": i}), &prev);
            prev = e.hash.clone();
            batch1.push(e);
        }
        let mut batch2 = Vec::new();
        for i in 0..3 {
            let e = AuditEvent::new("BATCH2", "svc", json!({"seq": i + 3}), &prev);
            prev = e.hash.clone();
            batch2.push(e);
        }
        let mut all = Vec::new();
        all.extend(batch1);
        all.extend(batch2);
        assert!(verify_chain(&all).is_none(), "cross-batch chain debe verificar");
    }
}
