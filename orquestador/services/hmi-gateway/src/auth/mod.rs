//! JWT RS256 + (STUB) FIDO2 endpoints + Argon2id (parámetros OWASP).
//!
//! ATENCIÓN: la verificación FIDO2 real no está implementada. Este módulo
//! contiene un stub explícito controlado por la variable de entorno
//! `FIDO2_REAL_VERIFY`. Cuando esa variable sea `false` (default), únicamente
//! aceptaremos el canario `POC_STUB_OK` enviado con el header `X-PoC-Stub:
//! enabled`. El resto de assertions son rechazadas.
//!
//! Para producción: ver `auth/webauthn.rs` con los TODOs y `webauthn-rs`.

pub mod sessions;
pub mod webauthn;

use std::path::Path;

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordVerifier, Version};
use chrono::{Duration, Utc};
use jsonwebtoken::{
    decode, encode, Algorithm as JwtAlgo, DecodingKey, EncodingKey, Header, Validation,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Canario explícito que sustituye el flujo FIDO2 real cuando la verificación
/// real está deshabilitada. NUNCA usar en producción.
pub const POC_STUB_CANARY: &str = "POC_STUB_OK";

/// TTL del challenge FIDO2 (segundos). Tras este tiempo expira y debe re-iniciarse.
pub const FIDO2_CHALLENGE_TTL_SECONDS: usize = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub iss: String,
    pub aud: String,
    pub exp: i64,
    pub iat: i64,
    pub jti: String,
    pub mfa_satisfied: bool,
}

pub struct JwtKeys {
    pub encoding: EncodingKey,
    pub decoding: DecodingKey,
    pub iss: String,
    pub aud: String,
    pub access_minutes: i64,
    pub refresh_days: i64,
}

impl JwtKeys {
    pub fn from_env() -> anyhow::Result<Self> {
        let priv_path = std::env::var("JWT_PRIVATE_KEY_PATH")?;
        let pub_path = std::env::var("JWT_PUBLIC_KEY_PATH")?;
        Self::from_files(priv_path.as_ref(), pub_path.as_ref())
    }

    pub fn from_files(priv_path: &Path, pub_path: &Path) -> anyhow::Result<Self> {
        let priv_pem = std::fs::read(priv_path)?;
        let pub_pem = std::fs::read(pub_path)?;
        Ok(Self {
            encoding: EncodingKey::from_rsa_pem(&priv_pem)?,
            decoding: DecodingKey::from_rsa_pem(&pub_pem)?,
            iss: std::env::var("JWT_ISSUER").unwrap_or_else(|_| "cupula-celestial".into()),
            aud: std::env::var("JWT_AUDIENCE").unwrap_or_else(|_| "hmi-operador".into()),
            access_minutes: std::env::var("JWT_ACCESS_TOKEN_MINUTES")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(15),
            refresh_days: std::env::var("JWT_REFRESH_TOKEN_DAYS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(7),
        })
    }

    pub fn issue_access(&self, user_id: &str, role: &str, mfa: bool) -> anyhow::Result<String> {
        let now = Utc::now();
        let claims = Claims {
            sub: user_id.into(),
            role: role.into(),
            iss: self.iss.clone(),
            aud: self.aud.clone(),
            iat: now.timestamp(),
            exp: (now + Duration::minutes(self.access_minutes)).timestamp(),
            jti: Uuid::new_v4().to_string(),
            mfa_satisfied: mfa,
        };
        let header = Header::new(JwtAlgo::RS256);
        Ok(encode(&header, &claims, &self.encoding)?)
    }

    pub fn verify(&self, token: &str) -> anyhow::Result<Claims> {
        let mut v = Validation::new(JwtAlgo::RS256);
        v.set_issuer(&[self.iss.clone()]);
        v.set_audience(&[self.aud.clone()]);
        let data = decode::<Claims>(token, &self.decoding, &v)?;
        Ok(data.claims)
    }
}

// ===========================================================================
// Argon2id — parámetros OWASP 2023 (m=65536 KiB, t=3, p=4)
// ===========================================================================

/// Crea un Argon2id con parámetros OWASP recomendados.
fn build_argon2() -> Argon2<'static> {
    // OWASP Password Storage Cheat Sheet (2023): m=64MiB, t=3, p=4
    let params = Params::new(65536, 3, 4, None)
        .expect("argon2 params OWASP válidos (65536, 3, 4)");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub fn hash_password(pw: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon = build_argon2();
    let h = argon
        .hash_password(pw.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("argon2: {e}"))?
        .to_string();
    Ok(h)
}

/// Verifica una contraseña frente a su hash Argon2.
///
/// Importante: el hash llevado en BD incluye los parámetros, por lo que se
/// utiliza `Argon2::default()` que respeta los del propio hash al verificar.
pub fn verify_password(pw: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(pw.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

// ===========================================================================
// Generación de challenges criptográficos (32 bytes aleatorios)
// ===========================================================================

/// Genera un challenge FIDO2 criptográfico de 32 bytes (hex 64 chars).
pub fn generate_fido2_challenge() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

/// Determinista (sólo para los endpoints de testing donde la firma del
/// challenge importa menos que el hecho de almacenarlo en Redis).
pub fn fido2_challenge_for(user_id: &str) -> String {
    let mut h = Sha256::new();
    h.update(user_id.as_bytes());
    h.update(Utc::now().timestamp_millis().to_le_bytes());
    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    h.update(buf);
    hex::encode(h.finalize())
}

// ===========================================================================
// FIDO2 verify — STUB EXPLÍCITO (PoC ONLY)
// ===========================================================================

/// Resultado de `fido2_verify`. Distingue motivos para tracing/audit y testing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fido2Outcome {
    /// Verificación real exitosa (webauthn-rs).
    VerifiedReal,
    /// Stub activo + canario `POC_STUB_OK` con header explícito.
    StubCanaryAccepted,
    /// Fallido: stub deshabilitado y sin verificación real.
    RejectedStubDisabled,
    /// Fallido: assertion no coincide con canario o formato inválido.
    RejectedBadAssertion,
    /// Fallido: challenge no existe o expiró.
    RejectedChallengeNotFound,
    /// Fallido: longitud / formato inválido (no hex, demasiado corto, etc.).
    RejectedFormat,
    /// Fallido: counter rollback detectado (clonación de authenticator).
    RejectedCounterRollback,
    /// Aviso: la ruta REAL existe pero debe llamarse vía /auth/webauthn/*.
    UseWebauthnFlow,
}

/// Verifica el factor FIDO2.
///
/// Parámetros:
/// - `assertion`: cadena recibida del cliente. En modo real debe ser
///   `webauthn-rs::PublicKeyCredential` serializado; en modo stub debe ser
///   exactamente `POC_STUB_OK`.
/// - `expected_challenge`: challenge guardado server-side (Redis). Si `None`,
///   se asume challenge no encontrado/expirado.
/// - `received_challenge_hex`: challenge declarado por el cliente para hacer
///   match con el server-side. Sólo se usa en stub mode (en real lo extrae la
///   librería webauthn).
/// - `stub_header_present`: ¿se envió `X-PoC-Stub: enabled`?
///
/// Reglas:
/// - Si `FIDO2_REAL_VERIFY=true` se delega a `webauthn::verify_real` (TODO).
/// - Si no, *sólo* aceptamos cuando todas estas se cumplen:
///   1) `stub_header_present == true`
///   2) `assertion == POC_STUB_OK`
///   3) `expected_challenge.is_some()` (challenge fue emitido)
///   4) `received_challenge_hex == expected_challenge` (single-use, viene de Redis)
pub fn fido2_verify(
    assertion: &str,
    expected_challenge: Option<&str>,
    received_challenge_hex: &str,
    stub_header_present: bool,
) -> Fido2Outcome {
    if fido2_real_verify_enabled() {
        // Verificación real: delegada a webauthn-rs (no implementada).
        return webauthn::verify_real(assertion, expected_challenge, received_challenge_hex);
    }

    // Validación formato challenge: 64 hex chars
    if received_challenge_hex.len() != 64 || hex::decode(received_challenge_hex).is_err() {
        return Fido2Outcome::RejectedFormat;
    }

    let expected = match expected_challenge {
        Some(e) => e,
        None => return Fido2Outcome::RejectedChallengeNotFound,
    };

    if !stub_header_present {
        return Fido2Outcome::RejectedStubDisabled;
    }
    if assertion != POC_STUB_CANARY {
        return Fido2Outcome::RejectedBadAssertion;
    }
    if !constant_time_eq(received_challenge_hex.as_bytes(), expected.as_bytes()) {
        return Fido2Outcome::RejectedChallengeNotFound;
    }
    Fido2Outcome::StubCanaryAccepted
}

/// Comparación constant-time para evitar timing attacks.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Lee la variable `FIDO2_REAL_VERIFY`. Default FASE 2: **true** (webauthn-rs real).
/// El stub canario sigue activable explícitamente con `FIDO2_REAL_VERIFY=false`
/// únicamente para tests de regresión.
pub fn fido2_real_verify_enabled() -> bool {
    std::env::var("FIDO2_REAL_VERIFY")
        .map(|s| matches!(s.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true)
}

/// Devuelve la etiqueta textual del estado del subsistema FIDO2 para
/// inclusión en banners de arranque y healthchecks.
pub fn fido2_status_label() -> &'static str {
    if fido2_real_verify_enabled() {
        "REAL (webauthn-rs)"
    } else {
        "STUB_POC"
    }
}

// ===========================================================================
// Tests unitarios
// ===========================================================================
#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_challenge() -> String {
        generate_fido2_challenge()
    }

    #[test]
    fn rejects_when_stub_header_missing() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = fresh_challenge();
        let out = fido2_verify(POC_STUB_CANARY, Some(&ch), &ch, false);
        assert_eq!(out, Fido2Outcome::RejectedStubDisabled);
    }

    #[test]
    fn rejects_arbitrary_assertion_with_stub_enabled() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = fresh_challenge();
        let out = fido2_verify("deadbeefdeadbeef", Some(&ch), &ch, true);
        assert_eq!(out, Fido2Outcome::RejectedBadAssertion);
    }

    #[test]
    fn rejects_when_challenge_expired_or_missing() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = fresh_challenge();
        let out = fido2_verify(POC_STUB_CANARY, None, &ch, true);
        assert_eq!(out, Fido2Outcome::RejectedChallengeNotFound);
    }

    #[test]
    fn rejects_when_received_challenge_mismatches_server_side() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let server_ch = fresh_challenge();
        let other_ch = fresh_challenge();
        let out = fido2_verify(POC_STUB_CANARY, Some(&server_ch), &other_ch, true);
        assert_eq!(out, Fido2Outcome::RejectedChallengeNotFound);
    }

    #[test]
    fn rejects_bad_format() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let out = fido2_verify(POC_STUB_CANARY, Some("xx"), "xx", true);
        assert_eq!(out, Fido2Outcome::RejectedFormat);
    }

    #[test]
    fn accepts_canary_with_valid_challenge_and_header() {
        std::env::set_var("FIDO2_REAL_VERIFY", "false");
        let ch = fresh_challenge();
        let out = fido2_verify(POC_STUB_CANARY, Some(&ch), &ch, true);
        assert_eq!(out, Fido2Outcome::StubCanaryAccepted);
    }

    #[test]
    fn argon2_owasp_params_roundtrip() {
        let h = hash_password("hola_mundo_123").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(verify_password("hola_mundo_123", &h));
        assert!(!verify_password("hola_mundo_124", &h));
    }
}
