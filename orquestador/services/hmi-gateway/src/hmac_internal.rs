//! HMAC-SHA256 para llamadas inter-servicio.
//!
//! Usado por el hmi-gateway para firmar requests hacia el swarm-controller
//! y por el swarm-controller para verificarlas. La clave se comparte por env
//! `INTERNAL_SVC_HMAC_KEY`. Header de transporte: `X-Internal-Auth: <hmac_hex>`.

#![allow(dead_code)] // helpers expuestos a futuros endpoints que invoquen al swarm-controller.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Firma `body` con la clave compartida (env `INTERNAL_SVC_HMAC_KEY`).
pub fn sign_body(body: &[u8]) -> Option<String> {
    let key = std::env::var("INTERNAL_SVC_HMAC_KEY").ok()?;
    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).ok()?;
    mac.update(body);
    Some(hex::encode(mac.finalize().into_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_deterministic() {
        std::env::set_var("INTERNAL_SVC_HMAC_KEY", "my_key");
        let a = sign_body(b"hello world").unwrap();
        let b = sign_body(b"hello world").unwrap();
        assert_eq!(a, b);
        assert_eq!(a.len(), 64); // sha256 hex
    }
}
