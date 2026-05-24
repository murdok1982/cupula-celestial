-- ===========================================================================
-- Cúpula Celestial — esquema inicial
-- Aplicado automáticamente por docker-entrypoint-initdb.d de la imagen Postgres.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Sensores registrados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sensors_registered (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_code  TEXT UNIQUE NOT NULL,
    sensor_type  TEXT NOT NULL CHECK (sensor_type IN ('RADAR_AESA','RADAR_PASSIVE','RF_SPECTRUM','EO_IR','ACOUSTIC','LIDAR','SAT_EO_SAR','ADSB','REMOTE_ID')),
    location     GEOGRAPHY(POINT, 4326) NOT NULL,
    altitude_m   REAL NOT NULL DEFAULT 0.0,
    range_km     REAL NOT NULL,
    status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEGRADED','OFFLINE','MAINT')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sensors_location ON sensors_registered USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_sensors_status   ON sensors_registered (status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Interceptores (drones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interceptors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    callsign        TEXT UNIQUE NOT NULL,
    interceptor_type TEXT NOT NULL,
    payload_type    TEXT NOT NULL CHECK (payload_type IN ('KINETIC','NET','FRAG','JAMMER','RECOVERY')),
    base_location   GEOGRAPHY(POINT, 4326),
    last_position   GEOGRAPHY(POINTZ, 4326),
    last_velocity_mps REAL,
    battery_pct     REAL CHECK (battery_pct BETWEEN 0 AND 100),
    status          TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','LAUNCHING','ENROUTE','LOITER','ENGAGING','RTH','MAINT','LOST')),
    last_telemetry_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_interceptors_status ON interceptors(status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Geofences (zonas protegidas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geofences (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    fence_type  TEXT NOT NULL CHECK (fence_type IN ('NO_FLY','PROTECTED','HOSPITAL','EMBASSY','SCHOOL','CRITICAL_INFRA')),
    geometry    GEOGRAPHY(POLYGON, 4326) NOT NULL,
    altitude_min_m REAL DEFAULT 0.0,
    altitude_max_m REAL DEFAULT 1000.0,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST (geometry);

-- ---------------------------------------------------------------------------
-- Engagements (registro de cada autorización)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    track_id            TEXT NOT NULL,
    recommendation_id   UUID NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('RECOMMENDED','AUTHORIZED','REJECTED','COMMANDED','ABORTED','COMPLETED','FAILED')),
    operator_id         UUID,
    authorized_at       TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    interceptors_assigned UUID[] NOT NULL DEFAULT '{}',
    pk_estimated        REAL,
    collateral_risk     TEXT CHECK (collateral_risk IN ('NEGLIGIBLE','LOW','MEDIUM','HIGH')),
    rationale           TEXT,
    raw_recommendation  JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_status ON engagements(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagements_track ON engagements(track_id);

-- ---------------------------------------------------------------------------
-- ROE versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roe_versions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_tag TEXT UNIQUE NOT NULL,
    rego_source TEXT NOT NULL,
    signed_by   TEXT NOT NULL,
    signature   TEXT NOT NULL,
    active_from TIMESTAMPTZ NOT NULL,
    active_to   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roe_active ON roe_versions(active_from, active_to);
