-- ===========================================================================
-- Historial de tracks (TimescaleDB hypertable)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS tracks_history (
    "time"           TIMESTAMPTZ      NOT NULL,
    track_id         TEXT             NOT NULL,
    px_m             DOUBLE PRECISION NOT NULL,
    py_m             DOUBLE PRECISION NOT NULL,
    pz_m             DOUBLE PRECISION NOT NULL,
    vx_mps           DOUBLE PRECISION NOT NULL,
    vy_mps           DOUBLE PRECISION NOT NULL,
    vz_mps           DOUBLE PRECISION NOT NULL,
    ax_mps2          DOUBLE PRECISION,
    ay_mps2          DOUBLE PRECISION,
    az_mps2          DOUBLE PRECISION,
    speed_mps        DOUBLE PRECISION,
    heading_deg      DOUBLE PRECISION,
    altitude_agl_m   DOUBLE PRECISION,
    classification   TEXT,
    confidence       REAL,
    imm_mode         TEXT,
    track_quality    REAL,
    iff_status       TEXT,
    sensors          TEXT[]           NOT NULL DEFAULT '{}',
    covariance       JSONB,
    geom             GEOGRAPHY(POINTZ, 4326)
);

-- Convertir en hypertable particionado por tiempo
SELECT create_hypertable('tracks_history', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_tracks_history_id_time
    ON tracks_history (track_id, "time" DESC);

CREATE INDEX IF NOT EXISTS idx_tracks_history_geom
    ON tracks_history USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_tracks_history_class
    ON tracks_history (classification, "time" DESC);

-- Política de retención: 30 días (PoC)
SELECT add_retention_policy('tracks_history', INTERVAL '30 days', if_not_exists => TRUE);

-- Vista de tracks activos: último update por track_id en últimos 60s
CREATE OR REPLACE VIEW active_tracks AS
SELECT DISTINCT ON (track_id)
    track_id,
    "time" AS last_update,
    px_m, py_m, pz_m,
    vx_mps, vy_mps, vz_mps,
    classification,
    confidence,
    track_quality,
    imm_mode,
    iff_status,
    sensors,
    geom
FROM tracks_history
WHERE "time" > now() - INTERVAL '60 seconds'
ORDER BY track_id, "time" DESC;
