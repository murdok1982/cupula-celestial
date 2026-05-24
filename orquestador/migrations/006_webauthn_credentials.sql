-- ===========================================================================
-- FASE 2 — H-CRIT-002 cierre: webauthn-rs REAL
-- Persistencia de credenciales FIDO2/WebAuthn por usuario.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    credential_id     BYTEA      PRIMARY KEY,
    user_id           UUID       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key        BYTEA      NOT NULL,
    counter           BIGINT     NOT NULL DEFAULT 0,
    aaguid            UUID,
    attestation_type  TEXT       NOT NULL DEFAULT 'none',
    transports        TEXT[]     NOT NULL DEFAULT '{}',
    backup_eligible   BOOLEAN    NOT NULL DEFAULT FALSE,
    backup_state      BOOLEAN    NOT NULL DEFAULT FALSE,
    -- Serialización completa de webauthn_rs::prelude::Passkey (JSON) para round-trip.
    -- La forma binaria se mantiene en public_key por compatibilidad/búsqueda.
    passkey_json      JSONB      NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

-- Tabla auxiliar para flujos en curso (registration / authentication states).
-- TTL implícito por `expires_at`; un cron de limpieza puede borrar las caducadas.
CREATE TABLE IF NOT EXISTS webauthn_states (
    challenge_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_kind     TEXT NOT NULL CHECK (state_kind IN ('registration', 'authentication')),
    state_json     JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_states_user ON webauthn_states(user_id, state_kind);
CREATE INDEX IF NOT EXISTS idx_webauthn_states_expiry ON webauthn_states(expires_at);

-- Cleanup retroactivo opcional (no rompe nada si está vacío):
-- DELETE FROM webauthn_states WHERE expires_at < now();
