//! Crypto bindings — FASE 2.
//!
//! - `pqc`: stub funcional de criptografía post-cuántica híbrida (Kyber768 KEM
//!   y Dilithium3 signature). Activable con `--features pqc-hybrid` Y
//!   `PQC_HYBRID_ENABLED=true`.
//! - `tls`: helpers para cargar certificados rustls (mTLS interno).

pub mod tls;

#[cfg(feature = "pqc-hybrid")]
pub mod pqc;
