-- ===========================================================================
-- FASE 2 — Audit Batch Signing (HSM)
--
-- Cada N segundos o M eventos, audit-log calcula el "batch root" (hash de
-- todos los hash de eventos en la ventana) y lo firma con la clave HSM.
-- Cualquier tampering en una fila de la ventana invalida la firma.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS audit_batches (
    batch_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seq_start       BIGINT NOT NULL,
    seq_end         BIGINT NOT NULL,
    batch_root      CHAR(64) NOT NULL,          -- sha256 hex de la concat de hashes
    batch_signature BYTEA  NOT NULL,             -- firma Ed25519 (64 bytes)
    signing_key_id  TEXT   NOT NULL,             -- key_id devuelto por el HSM
    algorithm       TEXT   NOT NULL DEFAULT 'Ed25519',
    event_count     INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_batches_range ON audit_batches(seq_start, seq_end);
CREATE INDEX IF NOT EXISTS idx_audit_batches_created ON audit_batches(created_at DESC);

-- También guardamos la pubkey del HSM para verificación independiente
-- (auditoría externa, witness nodes).
CREATE TABLE IF NOT EXISTS audit_signing_keys (
    key_id      TEXT PRIMARY KEY,
    public_key  BYTEA NOT NULL,
    algorithm   TEXT  NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at  TIMESTAMPTZ
);

-- Protección append-only para batches y signing_keys.
CREATE OR REPLACE FUNCTION audit_batches_no_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_batches es append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_batches_block_update ON audit_batches;
CREATE TRIGGER audit_batches_block_update
    BEFORE UPDATE ON audit_batches
    FOR EACH ROW EXECUTE FUNCTION audit_batches_no_modify();

DROP TRIGGER IF EXISTS audit_batches_block_delete ON audit_batches;
CREATE TRIGGER audit_batches_block_delete
    BEFORE DELETE ON audit_batches
    FOR EACH ROW EXECUTE FUNCTION audit_batches_no_modify();
