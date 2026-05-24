//! TLS helpers para mTLS interno entre microservicios.
//!
//! Carga certs PEM desde rutas en env (`TLS_CERT_PATH`, `TLS_KEY_PATH`,
//! `TLS_CA_PATH`). Si las rutas no existen, devuelve `None` y el servicio
//! arranca en plaintext (modo dev). En producción `MTLS_REQUIRE_CLIENT_CERT=true`.

use anyhow::{Context, Result};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub struct TlsBundle {
    pub cert_chain: Vec<rustls::pki_types::CertificateDer<'static>>,
    pub key: rustls::pki_types::PrivateKeyDer<'static>,
    pub ca_certs: Vec<rustls::pki_types::CertificateDer<'static>>,
    pub require_client_cert: bool,
}

pub fn load_from_env() -> Option<TlsBundle> {
    let cert_p = std::env::var("TLS_CERT_PATH").ok()?;
    let key_p = std::env::var("TLS_KEY_PATH").ok()?;
    let ca_p = std::env::var("TLS_CA_PATH").ok();
    let require_client_cert = std::env::var("MTLS_REQUIRE_CLIENT_CERT")
        .map(|s| matches!(s.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false);
    let bundle = build_bundle(
        Path::new(&cert_p),
        Path::new(&key_p),
        ca_p.as_deref().map(Path::new),
        require_client_cert,
    )
    .ok()?;
    Some(bundle)
}

pub fn build_bundle(
    cert_path: &Path,
    key_path: &Path,
    ca_path: Option<&Path>,
    require_client_cert: bool,
) -> Result<TlsBundle> {
    let cert_chain = load_certs(cert_path).context("cargando TLS_CERT_PATH")?;
    let key = load_key(key_path).context("cargando TLS_KEY_PATH")?;
    let ca_certs = match ca_path {
        Some(p) if p.exists() => load_certs(p).context("cargando TLS_CA_PATH")?,
        _ => Vec::new(),
    };
    Ok(TlsBundle {
        cert_chain,
        key,
        ca_certs,
        require_client_cert,
    })
}

fn load_certs(path: &Path) -> Result<Vec<rustls::pki_types::CertificateDer<'static>>> {
    let f = File::open(path).with_context(|| format!("abrir {}", path.display()))?;
    let mut reader = BufReader::new(f);
    let certs: Vec<_> = rustls_pemfile::certs(&mut reader)
        .filter_map(|r| r.ok())
        .collect();
    if certs.is_empty() {
        anyhow::bail!("sin certs en {}", path.display());
    }
    Ok(certs)
}

fn load_key(path: &Path) -> Result<rustls::pki_types::PrivateKeyDer<'static>> {
    let f = File::open(path).with_context(|| format!("abrir {}", path.display()))?;
    let mut reader = BufReader::new(f);
    if let Some(k) = rustls_pemfile::private_key(&mut reader)? {
        Ok(k)
    } else {
        anyhow::bail!("sin private key en {}", path.display())
    }
}
