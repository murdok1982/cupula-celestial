//! HSM abstracción — audit-log firma batches Merkle con HSM-backed key.
//!
//! FASE 2 cierre parcial de "HSM/TPM": trait + dos backends:
//! - `softhsm`: Ed25519 generada en disco (DEV). `HSM_BACKEND=softhsm` default.
//! - `pkcs11`: stub para YubiHSM2/Thales (PKCS#11). Requiere hardware.
//!
//! El audit-log firma cada *batch* (ventana de N eventos o T segundos) con la
//! HSM y persiste la firma + key_id en la cadena. `/v1/verify_chain` verifica
//! la firma del batch además del hash chain.

pub mod pkcs11;
pub mod softhsm;

use anyhow::Result;

/// Trait genérico HSM. `sign` devuelve la firma; `pubkey` la clave pública en
/// formato raw 32 bytes (Ed25519) o DER (PKCS#11).
pub trait HsmSigner: Send + Sync {
    fn sign(&self, data: &[u8]) -> Result<Vec<u8>>;
    fn pubkey(&self) -> &[u8];
    fn key_id(&self) -> &str;
    /// Algoritmo: "Ed25519" | "ECDSA-P256" según backend.
    fn algorithm(&self) -> &'static str;
}

/// Factory según env `HSM_BACKEND` (default `softhsm`).
pub fn build_signer_from_env() -> Result<Box<dyn HsmSigner>> {
    let backend = std::env::var("HSM_BACKEND").unwrap_or_else(|_| "softhsm".into());
    match backend.to_ascii_lowercase().as_str() {
        "softhsm" => Ok(Box::new(softhsm::SoftHsmSigner::from_env()?)),
        "pkcs11" => Ok(Box::new(pkcs11::Pkcs11Signer::from_env()?)),
        other => anyhow::bail!("HSM_BACKEND desconocido: {}", other),
    }
}

/// Verifica una firma Ed25519 con pubkey raw 32 bytes.
pub fn verify_ed25519(pubkey: &[u8], message: &[u8], sig: &[u8]) -> bool {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let key_arr: [u8; 32] = match pubkey.try_into() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let vk = match VerifyingKey::from_bytes(&key_arr) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let sig_arr: [u8; 64] = match sig.try_into() {
        Ok(s) => s,
        Err(_) => return false,
    };
    let sig = Signature::from_bytes(&sig_arr);
    vk.verify(message, &sig).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn softhsm_sign_verify_roundtrip() {
        let tmp = tempdir_path();
        std::env::set_var("HSM_KEY_PATH", &tmp);
        let signer = build_signer_from_env().unwrap();
        let msg = b"batch-root:abc";
        let sig = signer.sign(msg).unwrap();
        assert!(verify_ed25519(signer.pubkey(), msg, &sig));
        // tamper
        assert!(!verify_ed25519(signer.pubkey(), b"tampered", &sig));
    }

    #[test]
    fn test_hsm_signer_ed25519_roundtrip() {
        let tmp = tempdir_path();
        std::env::set_var("HSM_KEY_PATH", &tmp);
        let signer = build_signer_from_env().unwrap();
        let msgs = vec![b"msg1", b"batch-data-xyz", b"longer-message-12345"];
        for msg in msgs {
            let sig = signer.sign(msg).unwrap();
            assert!(verify_ed25519(signer.pubkey(), msg, &sig));
        }
        assert_eq!(signer.algorithm(), "Ed25519");
        assert!(!signer.key_id().is_empty());
    }

    #[test]
    fn test_hsm_signer_pubkey_persistent() {
        let tmp = tempdir_path();
        std::env::set_var("HSM_KEY_PATH", &tmp);
        let s1 = build_signer_from_env().unwrap();
        let pk1 = s1.pubkey().to_vec();
        let s2 = build_signer_from_env().unwrap();
        assert_eq!(s1.pubkey(), s2.pubkey(), "la misma clave debe persistir");
        assert_eq!(s1.key_id(), s2.key_id());
    }

    fn tempdir_path() -> String {
        let base = std::env::temp_dir().join(format!(
            "cupula-hsm-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base.join("hsm-key.pem").to_string_lossy().to_string()
    }
}
