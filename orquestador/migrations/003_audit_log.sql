-- ===========================================================================
-- Audit log append-only con cadena Merkle (SHA-256).
-- Las inserciones se gobiernan por el servicio audit-log; un trigger BEFORE
-- impide UPDATE/DELETE.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    seq          BIGSERIAL PRIMARY KEY,
    event_id     UUID NOT NULL DEFAULT uuid_generate_v4(),
    event_type   TEXT NOT NULL,
    event_time   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor        TEXT NOT NULL,
    payload      JSONB NOT NULL,
    prev_hash    CHAR(64) NOT NULL,
    hash         CHAR(64) NOT NULL,
    signature    TEXT,
    CONSTRAINT audit_log_hash_unique UNIQUE (hash)
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_time ON audit_log(event_time DESC);

-- Protección append-only
CREATE OR REPLACE FUNCTION audit_log_no_modify()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log es append-only: UPDATE/DELETE prohibidos (seq=%, event=%)',
        OLD.seq, OLD.event_type;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_block_update ON audit_log;
CREATE TRIGGER audit_log_block_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_no_modify();

DROP TRIGGER IF EXISTS audit_log_block_delete ON audit_log;
CREATE TRIGGER audit_log_block_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_no_modify();

-- Función de verificación de integridad: recorre la cadena y devuelve la primera ruptura.
CREATE OR REPLACE FUNCTION audit_log_verify_chain()
RETURNS TABLE(broken_seq BIGINT, expected_prev_hash CHAR(64), actual_prev_hash CHAR(64)) AS $$
DECLARE
    prev CHAR(64) := repeat('0', 64);
    r RECORD;
BEGIN
    FOR r IN SELECT seq, prev_hash, hash FROM audit_log ORDER BY seq ASC LOOP
        IF r.prev_hash <> prev THEN
            broken_seq := r.seq;
            expected_prev_hash := prev;
            actual_prev_hash := r.prev_hash;
            RETURN NEXT;
            RETURN;
        END IF;
        prev := r.hash;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
