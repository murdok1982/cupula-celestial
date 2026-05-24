//! PKCS#11 — stub para HSM hardware (YubiHSM2, Thales Luna, AWS CloudHSM).
//!
//! **PENDIENTE-HW**: requiere librería nativa (`libsofthsm2.so` o vendor lib).
//! Esta implementación carga las env vars y prepara el handle; el método
//! `sign` devuelve error explícito hasta que el operador despliegue HSM real.
//!
//! Para integración real, recomendamos el crate `cryptoki` (oasis-rs/cryptoki).
//!
//! Variables esperadas:
//! - `HSM_PKCS11_LIB` — path a la lib PKCS#11 (ej. `/usr/lib/softhsm/libsofthsm2.so`).
//! - `HSM_SLOT_ID` — slot ID numérico.
//! - `HSM_PIN` — PIN del slot.
//! - `HSM_KEY_LABEL` — label del key object (default `cupula-audit-signing`).

use anyhow::{anyhow, Result};

use super::HsmSigner;

pub struct Pkcs11Signer {
    /// Cargada de env para inspección/log; en stub no se usa.
    #[allow(dead_code)]
    lib_path: String,
    #[allow(dead_code)]
    slot_id: u32,
    #[allow(dead_code)]
    key_label: String,
    /// Placeholder pubkey 32 bytes (todo cero) hasta que el HSM real provea la real.
    pubkey: Vec<u8>,
    key_id: String,
}

impl Pkcs11Signer {
    pub fn from_env() -> Result<Self> {
        let lib_path = std::env::var("HSM_PKCS11_LIB")
            .map_err(|_| anyhow!("HSM_PKCS11_LIB no definida"))?;
        let slot_id: u32 = std::env::var("HSM_SLOT_ID")
            .map_err(|_| anyhow!("HSM_SLOT_ID no definida"))?
            .parse()
            .map_err(|e| anyhow!("HSM_SLOT_ID parse: {e}"))?;
        let _pin = std::env::var("HSM_PIN").map_err(|_| anyhow!("HSM_PIN no definida"))?;
        let key_label = std::env::var("HSM_KEY_LABEL")
            .unwrap_or_else(|_| "cupula-audit-signing".into());
        tracing::warn!(
            lib = %lib_path,
            slot = slot_id,
            label = %key_label,
            "PKCS#11 signer instanciado en modo STUB. Sustituir por cryptoki real."
        );
        Ok(Self {
            lib_path,
            slot_id,
            key_label,
            pubkey: vec![0u8; 32],
            key_id: "pkcs11-stub".into(),
        })
    }
}

impl HsmSigner for Pkcs11Signer {
    fn sign(&self, _data: &[u8]) -> Result<Vec<u8>> {
        // TODO(prod):
        // let session = cryptoki::Pkcs11::new(&self.lib_path)?.open_session(...);
        // let private_handle = session.find_objects(...)?[0];
        // session.sign(Mechanism::EdDSA, private_handle, data)
        Err(anyhow!(
            "PKCS#11 signer en modo STUB (lib={}, slot={}, label={}). \
             Implementar con crate `cryptoki` antes de promover a producción.",
            self.lib_path,
            self.slot_id,
            self.key_label
        ))
    }

    fn pubkey(&self) -> &[u8] {
        &self.pubkey
    }

    fn key_id(&self) -> &str {
        &self.key_id
    }

    fn algorithm(&self) -> &'static str {
        "Ed25519/PKCS11"
    }
}
