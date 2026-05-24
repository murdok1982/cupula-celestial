//! webauthn-rs REAL — sustituye el stub FIDO2 de FASE 1.
//!
//! Diseño:
//! - `WebauthnService` singleton inicializado con `rp_id`, `rp_origin`.
//! - Estados de registro/autenticación persistidos en `webauthn_states` (BD), no en memoria
//!   (sirve a instancias múltiples del hmi-gateway).
//! - Credenciales persistidas en `webauthn_credentials` con counter para rollback detection.
//! - Counter rollback: rechaza autenticación si `new_counter <= stored_counter`
//!   (a menos que ambos sean 0, en cuyo caso el authenticator no soporta counter).
//!
//! Endpoints (registrados en main.rs):
//! - POST /auth/webauthn/register/begin
//! - POST /auth/webauthn/register/finish
//! - POST /auth/webauthn/authenticate/begin
//! - POST /auth/webauthn/authenticate/finish
//!
//! El flag `FIDO2_REAL_VERIFY=true` (default en FASE 2) habilita esta ruta.
//! El stub canario sigue disponible si `FIDO2_REAL_VERIFY=false` para tests legacy.

use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::*;

use super::Fido2Outcome;

const REGISTRATION_TTL_MINUTES: i64 = 10;
const AUTHENTICATION_TTL_MINUTES: i64 = 5;

/// Servicio singleton webauthn. Inicializar una vez al arranque.
#[derive(Clone)]
pub struct WebauthnService {
    inner: Arc<Webauthn>,
    pub rp_id: String,
    pub rp_origin: String,
}

impl WebauthnService {
    pub fn from_env() -> Result<Self> {
        let rp_id =
            std::env::var("WEBAUTHN_RP_ID").unwrap_or_else(|_| "cupula.local".to_string());
        let rp_origin = std::env::var("WEBAUTHN_RP_ORIGIN")
            .unwrap_or_else(|_| "https://cupula.local".to_string());
        let rp_name = std::env::var("WEBAUTHN_RP_NAME")
            .unwrap_or_else(|_| "Cúpula Celestial".to_string());

        let url = Url::parse(&rp_origin)
            .map_err(|e| anyhow!("WEBAUTHN_RP_ORIGIN inválida: {e}"))?;
        let builder = WebauthnBuilder::new(&rp_id, &url)
            .map_err(|e| anyhow!("WebauthnBuilder: {e:?}"))?
            .rp_name(&rp_name);
        let inner = Arc::new(
            builder
                .build()
                .map_err(|e| anyhow!("Webauthn build: {e:?}"))?,
        );
        Ok(Self {
            inner,
            rp_id,
            rp_origin,
        })
    }

    pub fn inner(&self) -> Arc<Webauthn> {
        self.inner.clone()
    }

    // -------------------------------------------------------------------
    // REGISTRATION
    // -------------------------------------------------------------------

    /// Inicia un flujo de registro. Persiste el `PasskeyRegistration` en BD.
    pub async fn start_registration(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        username: &str,
        display_name: &str,
        existing_credentials: Vec<CredentialID>,
    ) -> Result<(Uuid, CreationChallengeResponse)> {
        let exclude = if existing_credentials.is_empty() {
            None
        } else {
            Some(existing_credentials)
        };
        let (ccr, reg_state) = self
            .inner
            .start_passkey_registration(user_id, username, display_name, exclude)
            .map_err(|e| anyhow!("start_passkey_registration: {e:?}"))?;

        let state_json = serde_json::to_value(&reg_state)?;
        let expires_at = Utc::now() + Duration::minutes(REGISTRATION_TTL_MINUTES);
        let row: (Uuid,) = sqlx::query_as(
            r#"INSERT INTO webauthn_states (user_id, state_kind, state_json, expires_at)
               VALUES ($1, 'registration', $2, $3)
               RETURNING challenge_id"#,
        )
        .bind(user_id)
        .bind(state_json)
        .bind(expires_at)
        .fetch_one(pool)
        .await?;

        Ok((row.0, ccr))
    }

    /// Finaliza un registro. Verifica la attestation y persiste la credencial.
    pub async fn finish_registration(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        challenge_id: Uuid,
        reg: &RegisterPublicKeyCredential,
    ) -> Result<()> {
        let row: Option<(serde_json::Value, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            r#"SELECT state_json, expires_at
               FROM webauthn_states
               WHERE challenge_id = $1 AND user_id = $2 AND state_kind = 'registration'"#,
        )
        .bind(challenge_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        let (state_json, expires_at) =
            row.ok_or_else(|| anyhow!("registro: estado no encontrado"))?;
        if expires_at < Utc::now() {
            // limpieza
            let _ = sqlx::query("DELETE FROM webauthn_states WHERE challenge_id = $1")
                .bind(challenge_id)
                .execute(pool)
                .await;
            return Err(anyhow!("registro: estado expirado"));
        }

        let reg_state: PasskeyRegistration = serde_json::from_value(state_json)?;

        let passkey = self
            .inner
            .finish_passkey_registration(reg, &reg_state)
            .map_err(|e| anyhow!("finish_passkey_registration: {e:?}"))?;

        // Persistencia. webauthn-rs 0.5 expone `cred_id()` y `counter()` sobre Passkey.
        // El cred_id es un `Base64UrlSafeData` (wrapper sobre Vec<u8>).
        let cred_id_bytes: Vec<u8> = passkey.cred_id().as_ref().to_vec();
        let passkey_json = serde_json::to_value(&passkey)?;
        // public_key se guarda como representación serializada (opaca para audit).
        let pubkey_blob = serde_json::to_vec(&passkey)?;
        let counter: i64 = passkey.counter() as i64;

        sqlx::query(
            r#"INSERT INTO webauthn_credentials
               (credential_id, user_id, public_key, counter, attestation_type, passkey_json)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (credential_id) DO NOTHING"#,
        )
        .bind(&cred_id_bytes)
        .bind(user_id)
        .bind(&pubkey_blob)
        .bind(counter)
        .bind("passkey")
        .bind(passkey_json)
        .execute(pool)
        .await?;

        // Borrar el estado de registro (single-use).
        sqlx::query("DELETE FROM webauthn_states WHERE challenge_id = $1")
            .bind(challenge_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    // -------------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------------

    pub async fn start_authentication(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<(Uuid, RequestChallengeResponse)> {
        // Cargar passkeys del usuario
        let rows: Vec<(serde_json::Value,)> = sqlx::query_as(
            "SELECT passkey_json FROM webauthn_credentials WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        if rows.is_empty() {
            return Err(anyhow!("usuario sin credenciales WebAuthn registradas"));
        }
        let passkeys: Vec<Passkey> = rows
            .into_iter()
            .filter_map(|(j,)| serde_json::from_value(j).ok())
            .collect();

        let (rcr, auth_state) = self
            .inner
            .start_passkey_authentication(&passkeys)
            .map_err(|e| anyhow!("start_passkey_authentication: {e:?}"))?;

        let state_json = serde_json::to_value(&auth_state)?;
        let expires_at = Utc::now() + Duration::minutes(AUTHENTICATION_TTL_MINUTES);
        let row: (Uuid,) = sqlx::query_as(
            r#"INSERT INTO webauthn_states (user_id, state_kind, state_json, expires_at)
               VALUES ($1, 'authentication', $2, $3)
               RETURNING challenge_id"#,
        )
        .bind(user_id)
        .bind(state_json)
        .bind(expires_at)
        .fetch_one(pool)
        .await?;

        Ok((row.0, rcr))
    }

    /// Finaliza la autenticación. **Rechaza counter rollback** (clonado de authenticator).
    pub async fn finish_authentication(
        &self,
        pool: &PgPool,
        user_id: Uuid,
        challenge_id: Uuid,
        cred: &PublicKeyCredential,
    ) -> Result<Fido2Outcome> {
        let row: Option<(serde_json::Value, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            r#"SELECT state_json, expires_at
               FROM webauthn_states
               WHERE challenge_id = $1 AND user_id = $2 AND state_kind = 'authentication'"#,
        )
        .bind(challenge_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
        let (state_json, expires_at) = row
            .ok_or_else(|| anyhow!("autenticación: estado no encontrado"))?;
        if expires_at < Utc::now() {
            let _ = sqlx::query("DELETE FROM webauthn_states WHERE challenge_id = $1")
                .bind(challenge_id)
                .execute(pool)
                .await;
            return Ok(Fido2Outcome::RejectedChallengeNotFound);
        }

        let auth_state: PasskeyAuthentication = serde_json::from_value(state_json)?;
        let result = self
            .inner
            .finish_passkey_authentication(cred, &auth_state)
            .map_err(|e| anyhow!("finish_passkey_authentication: {e:?}"))?;

        // Counter rollback detection
        let cred_id_bytes: Vec<u8> = result.cred_id().as_ref().to_vec();
        let new_counter = result.counter();

        let stored: Option<(i64, serde_json::Value)> = sqlx::query_as(
            r#"SELECT counter, passkey_json FROM webauthn_credentials WHERE credential_id = $1"#,
        )
        .bind(&cred_id_bytes)
        .fetch_optional(pool)
        .await?;
        let (stored_counter, passkey_json) =
            stored.ok_or_else(|| anyhow!("credencial desconocida"))?;

        // Si ambos son 0 o el authenticator no soporta counter, permitimos.
        // Si new <= stored y stored > 0 → rollback ⇒ rechazo + cuarentena.
        if new_counter != 0 && (new_counter as i64) <= stored_counter {
            tracing::error!(
                user = %user_id,
                stored = stored_counter,
                received = new_counter,
                "FIDO2 counter rollback detectado — posible clonación de authenticator. Revocando credencial."
            );
            // Cuarentena: marcamos counter a un valor centinela altísimo para invalidar
            // y registramos. (En producción: invalidar credencial y forzar reregistro).
            sqlx::query(
                "UPDATE webauthn_credentials SET counter = 9223372036854775807 WHERE credential_id = $1",
            )
            .bind(&cred_id_bytes)
            .execute(pool)
            .await?;
            return Ok(Fido2Outcome::RejectedCounterRollback);
        }

        // Update counter + passkey state. webauthn-rs 0.5 expone `update_credential`
        // sobre Passkey que devuelve Option<bool>.
        let mut passkey: Passkey = serde_json::from_value(passkey_json)?;
        let _ = passkey.update_credential(&result);
        let updated_json = serde_json::to_value(&passkey)?;

        sqlx::query(
            r#"UPDATE webauthn_credentials
               SET counter = $1, passkey_json = $2, last_used_at = now()
               WHERE credential_id = $3"#,
        )
        .bind(new_counter as i64)
        .bind(updated_json)
        .bind(&cred_id_bytes)
        .execute(pool)
        .await?;

        // Single-use: borramos el estado
        sqlx::query("DELETE FROM webauthn_states WHERE challenge_id = $1")
            .bind(challenge_id)
            .execute(pool)
            .await?;

        Ok(Fido2Outcome::VerifiedReal)
    }

    pub async fn list_credentials_for_user(
        &self,
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<CredentialID>> {
        let rows: Vec<(Vec<u8>,)> = sqlx::query_as(
            "SELECT credential_id FROM webauthn_credentials WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;
        // CredentialID es `Base64UrlSafeData(Vec<u8>)` en webauthn-rs 0.5.
        Ok(rows.into_iter().map(|(b,)| CredentialID::from(b)).collect())
    }
}

// ---------------------------------------------------------------------------
// Verificación "real" usada desde el path stub legacy (fido2_verify).
// Permanece compatible: cuando FIDO2_REAL_VERIFY=true sin contexto de servicio,
// rechaza por seguridad indicando que se use el flujo /auth/webauthn/*.
// ---------------------------------------------------------------------------

pub fn verify_real(
    _assertion: &str,
    _expected_challenge: Option<&str>,
    _received_challenge_hex: &str,
) -> Fido2Outcome {
    tracing::warn!(
        "Llamada a verify_real() obsoleta. Use /auth/webauthn/authenticate/{{begin,finish}}."
    );
    Fido2Outcome::UseWebauthnFlow
}

// ---------------------------------------------------------------------------
// Tipos de request/response para los handlers (lo que se cablea en main.rs)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RegisterBeginReq {
    pub username: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterBeginResp {
    pub challenge_id: Uuid,
    pub options: CreationChallengeResponse,
}

#[derive(Debug, Deserialize)]
pub struct RegisterFinishReq {
    pub username: String,
    pub challenge_id: Uuid,
    pub credential: RegisterPublicKeyCredential,
}

#[derive(Debug, Deserialize)]
pub struct AuthenticateBeginReq {
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct AuthenticateBeginResp {
    pub challenge_id: Uuid,
    pub options: RequestChallengeResponse,
}

#[derive(Debug, Deserialize)]
pub struct AuthenticateFinishReq {
    pub username: String,
    pub challenge_id: Uuid,
    pub credential: PublicKeyCredential,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webauthn_service_builds_from_env() {
        std::env::set_var("WEBAUTHN_RP_ID", "cupula.local");
        std::env::set_var("WEBAUTHN_RP_ORIGIN", "https://cupula.local");
        let svc = WebauthnService::from_env().unwrap();
        assert_eq!(svc.rp_id, "cupula.local");
        assert!(svc.rp_origin.starts_with("https://"));
    }

    #[test]
    fn webauthn_service_rejects_bad_origin() {
        std::env::set_var("WEBAUTHN_RP_ID", "cupula.local");
        std::env::set_var("WEBAUTHN_RP_ORIGIN", "not a url");
        assert!(WebauthnService::from_env().is_err());
    }

    #[test]
    fn verify_real_now_redirects_to_webauthn_flow() {
        let out = verify_real("anything", Some("ch"), "ch");
        assert_eq!(out, Fido2Outcome::UseWebauthnFlow);
    }
}
