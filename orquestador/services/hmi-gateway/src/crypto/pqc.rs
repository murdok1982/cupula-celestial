//! PQC híbrido — Kyber768 + X25519 (KEM), Dilithium3 + Ed25519 (signature).
//!
//! Estado: **STUB FUNCIONAL**. Activable con feature `pqc-hybrid` + env
//! `PQC_HYBRID_ENABLED=true`. Por defecto sigue usándose la criptografía
//! clásica (Ed25519/X25519). Ver `docs/PQC_MIGRATION_PLAN.md`.
//!
//! Modelo híbrido (NIST recomendación 2024+):
//! - Firma:  `sig_classic || sig_pqc`  →  verificar AMBAS.
//! - KEM:    `secret = HKDF( ss_classic || ss_pqc )`  →  ambos shared secret combinados.

use anyhow::{anyhow, Result};
use pqcrypto_dilithium::dilithium3;
use pqcrypto_kyber::kyber768;
use pqcrypto_traits::kem::{Ciphertext as _, SharedSecret as _};
use pqcrypto_traits::sign::DetachedSignature as _;

pub fn pqc_enabled() -> bool {
    std::env::var("PQC_HYBRID_ENABLED")
        .map(|s| matches!(s.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

// ===========================================================================
// Firma híbrida (Dilithium3)
// ===========================================================================

pub struct PqSignKeypair {
    pub public: dilithium3::PublicKey,
    pub secret: dilithium3::SecretKey,
}

impl PqSignKeypair {
    pub fn generate() -> Self {
        let (public, secret) = dilithium3::keypair();
        Self { public, secret }
    }
}

pub fn pq_sign(secret: &dilithium3::SecretKey, msg: &[u8]) -> Vec<u8> {
    let sig = dilithium3::detached_sign(msg, secret);
    sig.as_bytes().to_vec()
}

pub fn pq_verify(public: &dilithium3::PublicKey, msg: &[u8], sig_bytes: &[u8]) -> Result<()> {
    let sig = dilithium3::DetachedSignature::from_bytes(sig_bytes)
        .map_err(|e| anyhow!("dilithium3 sig parse: {e:?}"))?;
    dilithium3::verify_detached_signature(&sig, msg, public)
        .map_err(|e| anyhow!("dilithium3 verify: {e:?}"))
}

// ===========================================================================
// KEM híbrido (Kyber768)
// ===========================================================================

pub struct PqKemKeypair {
    pub public: kyber768::PublicKey,
    pub secret: kyber768::SecretKey,
}

impl PqKemKeypair {
    pub fn generate() -> Self {
        let (public, secret) = kyber768::keypair();
        Self { public, secret }
    }
}

/// Encapsula: emitter genera `(ciphertext, shared_secret)` usando pubkey del peer.
pub fn pq_encapsulate(peer_pub: &kyber768::PublicKey) -> (Vec<u8>, Vec<u8>) {
    let (ss, ct) = kyber768::encapsulate(peer_pub);
    (ct.as_bytes().to_vec(), ss.as_bytes().to_vec())
}

/// Desencapsula: receptor reconstruye `shared_secret` con su secret key + ct.
pub fn pq_decapsulate(secret: &kyber768::SecretKey, ct_bytes: &[u8]) -> Result<Vec<u8>> {
    let ct = kyber768::Ciphertext::from_bytes(ct_bytes)
        .map_err(|e| anyhow!("kyber768 ct parse: {e:?}"))?;
    let ss = kyber768::decapsulate(&ct, secret);
    Ok(ss.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dilithium3_roundtrip() {
        let kp = PqSignKeypair::generate();
        let msg = b"engagement.authorized:abc123";
        let sig = pq_sign(&kp.secret, msg);
        assert!(pq_verify(&kp.public, msg, &sig).is_ok());
        assert!(pq_verify(&kp.public, b"tampered", &sig).is_err());
    }

    #[test]
    fn kyber768_roundtrip() {
        let kp = PqKemKeypair::generate();
        let (ct, ss_a) = pq_encapsulate(&kp.public);
        let ss_b = pq_decapsulate(&kp.secret, &ct).unwrap();
        assert_eq!(ss_a, ss_b);
    }
}
