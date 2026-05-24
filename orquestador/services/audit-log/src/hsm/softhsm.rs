//! SoftHSM Ed25519 — backend de desarrollo.
//!
//! Genera la clave Ed25519 en disco al arranque (modo dev), persistida en
//! `HSM_KEY_PATH` (default `/var/lib/cupula/hsm-key.pem`) con permisos 0600.
//! En el primer arranque crea la clave; en sucesivos la carga.
//!
//! Para producción: usar `pkcs11::Pkcs11Signer` apuntando a hardware HSM.

use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

use anyhow::{Context, Result};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use rand::rngs::OsRng;

use super::HsmSigner;

const PEM_BEGIN: &str = "-----BEGIN CUPULA SOFTHSM ED25519 PRIVATE KEY-----";
const PEM_END: &str = "-----END CUPULA SOFTHSM ED25519 PRIVATE KEY-----";

pub struct SoftHsmSigner {
    signing: SigningKey,
    pubkey: Vec<u8>,
    key_id: String,
}

impl SoftHsmSigner {
    pub fn from_env() -> Result<Self> {
        let path = std::env::var("HSM_KEY_PATH")
            .unwrap_or_else(|_| "/var/lib/cupula/hsm-key.pem".to_string());
        Self::load_or_create(PathBuf::from(path))
    }

    fn load_or_create(path: PathBuf) -> Result<Self> {
        if path.exists() {
            Self::load(path)
        } else {
            Self::create(path)
        }
    }

    fn create(path: PathBuf) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).ok();
        }
        let signing = SigningKey::generate(&mut OsRng);
        let bytes = signing.to_bytes();
        let body = hex::encode(bytes);
        let pem = format!("{}\n{}\n{}\n", PEM_BEGIN, body, PEM_END);

        let mut f = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .with_context(|| format!("crear {}", path.display()))?;
        f.write_all(pem.as_bytes())?;
        Self::chmod_0600(&path);

        tracing::warn!(
            "SoftHSM generó clave NUEVA en {}. En producción usa HSM hardware.",
            path.display()
        );
        let pubkey = signing.verifying_key().to_bytes().to_vec();
        let key_id = compute_key_id(&pubkey);
        Ok(Self {
            signing,
            pubkey,
            key_id,
        })
    }

    fn load(path: PathBuf) -> Result<Self> {
        let mut f = File::open(&path)
            .with_context(|| format!("abrir {}", path.display()))?;
        let mut s = String::new();
        f.read_to_string(&mut s)?;
        let body = s
            .lines()
            .filter(|l| !l.starts_with("---") && !l.trim().is_empty())
            .collect::<String>();
        let key_bytes = hex::decode(body.trim()).context("PEM body no es hex Ed25519")?;
        if key_bytes.len() != 32 {
            anyhow::bail!("Ed25519 priv key debe ser 32 bytes, got {}", key_bytes.len());
        }
        let key_arr: [u8; 32] = key_bytes.try_into().unwrap();
        let signing = SigningKey::from_bytes(&key_arr);
        let pubkey = signing.verifying_key().to_bytes().to_vec();
        let key_id = compute_key_id(&pubkey);
        Ok(Self {
            signing,
            pubkey,
            key_id,
        })
    }

    #[cfg(unix)]
    fn chmod_0600(path: &PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut p = meta.permissions();
            p.set_mode(0o600);
            let _ = std::fs::set_permissions(path, p);
        }
    }

    #[cfg(not(unix))]
    fn chmod_0600(_path: &PathBuf) {
        // En Windows no aplicamos chmod; el host debe restringir ACL del volumen.
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing.verifying_key()
    }
}

impl HsmSigner for SoftHsmSigner {
    fn sign(&self, data: &[u8]) -> Result<Vec<u8>> {
        let sig = self.signing.sign(data);
        Ok(sig.to_bytes().to_vec())
    }

    fn pubkey(&self) -> &[u8] {
        &self.pubkey
    }

    fn key_id(&self) -> &str {
        &self.key_id
    }

    fn algorithm(&self) -> &'static str {
        "Ed25519"
    }
}

/// `key_id = sha256(pubkey)[..16]` en hex (32 chars). Útil para auditoría sin
/// exponer la pubkey entera en cada batch.
fn compute_key_id(pubkey: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(pubkey);
    let digest = h.finalize();
    hex::encode(&digest[..16])
}
