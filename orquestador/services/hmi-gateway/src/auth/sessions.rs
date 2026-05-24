//! Gestión de sesiones, refresh tokens y blacklist de JWT (Redis).
//!
//! Modelo:
//! - `users(username, password_hash, role_id, mfa_required, failed_attempts, locked_until, ...)`
//! - `sessions(user_id, refresh_token_hash, expires_at, revoked_at, ...)`
//!
//! Funciones:
//! - `find_user_for_login`: consulta tabla `users` + role + estado lockout.
//! - `register_failed_login`: incrementa contador; aplica lockout >= 5.
//! - `register_successful_login`: resetea contador, set `last_login_at`.
//! - `issue_refresh_token` / `rotate_refresh_token` / `revoke_refresh_token`.
//! - `blacklist_jti`: añade jti del access token a Redis hasta `exp`.
//! - `is_jti_blacklisted`: middleware lookup.

use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use redis::AsyncCommands;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

pub const MAX_FAILED_ATTEMPTS: i32 = 5;
pub const LOCKOUT_DURATION_MINUTES: i64 = 15;
pub const REFRESH_TOKEN_BYTES: usize = 48;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub role_name: String,
    pub mfa_required: bool,
    pub active: bool,
    pub failed_attempts: i32,
    pub locked_until: Option<DateTime<Utc>>,
}

/// Recupera un usuario por username, incluyendo el nombre del rol y estado lockout.
/// Devuelve `Ok(None)` si no existe o está inactivo (para evitar user enumeration
/// fuera de la capa de servicio).
pub async fn find_user_for_login(pool: &PgPool, username: &str) -> sqlx::Result<Option<UserRow>> {
    let row = sqlx::query_as::<_, UserRow>(
        r#"SELECT u.id,
                  u.username,
                  u.password_hash,
                  r.name AS role_name,
                  u.mfa_required,
                  u.active,
                  u.failed_attempts,
                  u.locked_until
           FROM users u
           INNER JOIN roles r ON r.id = u.role_id
           WHERE lower(u.username) = lower($1) AND u.active = TRUE
           LIMIT 1"#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[derive(Debug, Clone, Copy)]
pub enum LockoutStatus {
    Open,
    Locked,
}

pub fn lockout_status(user: &UserRow, now: DateTime<Utc>) -> LockoutStatus {
    match user.locked_until {
        Some(t) if t > now => LockoutStatus::Locked,
        _ => LockoutStatus::Open,
    }
}

/// Tras un fallo de login: incrementa contador. Si supera `MAX_FAILED_ATTEMPTS`,
/// aplica `locked_until = now + 15 min`.
pub async fn register_failed_login(pool: &PgPool, user_id: Uuid) -> sqlx::Result<()> {
    let lock_until = Utc::now() + Duration::minutes(LOCKOUT_DURATION_MINUTES);
    sqlx::query(
        r#"UPDATE users
           SET failed_attempts = failed_attempts + 1,
               locked_until = CASE
                   WHEN failed_attempts + 1 >= $2 THEN $3
                   ELSE locked_until
               END,
               updated_at = now()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .bind(MAX_FAILED_ATTEMPTS)
    .bind(lock_until)
    .execute(pool)
    .await?;
    Ok(())
}

/// Login exitoso: resetea contador y set last_login_at.
pub async fn register_successful_login(pool: &PgPool, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query(
        r#"UPDATE users
           SET failed_attempts = 0,
               locked_until = NULL,
               last_login_at = now(),
               updated_at = now()
           WHERE id = $1"#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ===========================================================================
// Refresh tokens
// ===========================================================================

#[derive(Debug, Clone)]
pub struct IssuedRefresh {
    /// Token bruto que se devuelve al cliente UNA sola vez.
    pub token: String,
    /// Hash sha256 hex que guardamos en BD.
    pub hash: String,
    pub session_id: Uuid,
    pub expires_at: DateTime<Utc>,
}

pub fn hash_refresh_token(token: &str) -> String {
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    hex::encode(h.finalize())
}

pub fn generate_refresh_token() -> String {
    let mut buf = vec![0u8; REFRESH_TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub async fn issue_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    days: i64,
    user_agent: Option<&str>,
    ip: Option<&str>,
) -> sqlx::Result<IssuedRefresh> {
    let token = generate_refresh_token();
    let token_hash = hash_refresh_token(&token);
    let expires_at = Utc::now() + Duration::days(days);
    let ip_str_opt = ip.map(|s| s.to_string());
    let rec: (Uuid,) = sqlx::query_as(
        r#"INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address)
           VALUES ($1, $2, $3, $4, CAST($5 AS inet))
           RETURNING id"#,
    )
    .bind(user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .bind(user_agent)
    .bind(ip_str_opt)
    .fetch_one(pool)
    .await?;
    Ok(IssuedRefresh {
        token,
        hash: token_hash,
        session_id: rec.0,
        expires_at,
    })
}

#[derive(Debug, Clone)]
pub struct SessionRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub revoked_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
}

/// Recupera una sesión a partir del refresh_token bruto (calcula hash internamente).
pub async fn find_session(pool: &PgPool, refresh_token: &str) -> sqlx::Result<Option<SessionRow>> {
    let token_hash = hash_refresh_token(refresh_token);
    let row = sqlx::query_as::<_, (Uuid, Uuid, Option<DateTime<Utc>>, DateTime<Utc>)>(
        r#"SELECT id, user_id, revoked_at, expires_at
           FROM sessions
           WHERE refresh_token_hash = $1
           LIMIT 1"#,
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id, user_id, revoked_at, expires_at)| SessionRow {
        id,
        user_id,
        revoked_at,
        expires_at,
    }))
}

pub async fn revoke_session(pool: &PgPool, session_id: Uuid) -> sqlx::Result<()> {
    sqlx::query(
        r#"UPDATE sessions
           SET revoked_at = now()
           WHERE id = $1 AND revoked_at IS NULL"#,
    )
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn revoke_all_sessions_for_user(pool: &PgPool, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query(
        r#"UPDATE sessions
           SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL"#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ===========================================================================
// JWT blacklist (Redis)
// ===========================================================================

/// Añade un JTI a la blacklist Redis con TTL = `expires_in_seconds`.
pub async fn blacklist_jti(
    redis: &redis::Client,
    jti: &str,
    expires_in_seconds: u64,
) -> redis::RedisResult<()> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let key = format!("jwt:blacklist:{}", jti);
    let _: () = conn.set_ex(key, "1", expires_in_seconds).await?;
    Ok(())
}

pub async fn is_jti_blacklisted(redis: &redis::Client, jti: &str) -> bool {
    let mut conn = match redis.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(_) => return false, // si Redis está caído, fail-open en PoC; en prod fail-closed
    };
    let key = format!("jwt:blacklist:{}", jti);
    let v: redis::RedisResult<Option<String>> = conn.get(&key).await;
    matches!(v, Ok(Some(_)))
}

// ===========================================================================
// FIDO2 challenge store (Redis) — single-use, TTL 60s
// ===========================================================================

pub async fn store_fido2_challenge(
    redis: &redis::Client,
    user_id: &str,
    challenge: &str,
    ttl_seconds: usize,
) -> redis::RedisResult<()> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let key = format!("fido2:challenge:{}", user_id);
    let _: () = conn.set_ex(key, challenge, ttl_seconds as u64).await?;
    Ok(())
}

pub async fn consume_fido2_challenge(
    redis: &redis::Client,
    user_id: &str,
) -> redis::RedisResult<Option<String>> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let key = format!("fido2:challenge:{}", user_id);
    // GETDEL → single-use
    let v: Option<String> = redis::cmd("GETDEL").arg(&key).query_async(&mut conn).await?;
    Ok(v)
}

// ===========================================================================
// MFA proof nonce store (server-side, single-use, TTL 60s)
// ===========================================================================

pub fn generate_mfa_proof() -> String {
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

pub async fn store_mfa_proof(
    redis: &redis::Client,
    user_id: &str,
    proof: &str,
    ttl_seconds: usize,
) -> redis::RedisResult<()> {
    let mut conn = redis.get_multiplexed_async_connection().await?;
    let key = format!("mfa:proof:{}", user_id);
    let _: () = conn.set_ex(key, proof, ttl_seconds as u64).await?;
    Ok(())
}

pub async fn consume_mfa_proof(
    redis: &redis::Client,
    user_id: &str,
    submitted: &str,
) -> bool {
    let mut conn = match redis.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(_) => return false,
    };
    let key = format!("mfa:proof:{}", user_id);
    let v: redis::RedisResult<Option<String>> = redis::cmd("GETDEL").arg(&key).query_async(&mut conn).await;
    match v {
        Ok(Some(stored)) if stored == submitted => true,
        _ => false,
    }
}
