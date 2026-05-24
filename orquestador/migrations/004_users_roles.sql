-- ===========================================================================
-- Usuarios, roles y autenticación
-- ===========================================================================

CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (name, description) VALUES
    ('OPS_OFFICER',  'Oficial de operaciones — autoriza engagement nivel 1'),
    ('CO',           'Comandante — autoriza engagement nivel 2 (alta colateral)'),
    ('ANALYST',      'Analista — sólo lectura'),
    ('ROE_OFFICER',  'Oficial ROE — gestión de reglas'),
    ('AUDIT',        'Auditor — sólo lectura del audit-log'),
    ('SYSTEM',       'Cuenta de servicio inter-microservicio')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        TEXT UNIQUE NOT NULL,
    full_name       TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role_id         UUID NOT NULL REFERENCES roles(id),
    fido2_credentials JSONB NOT NULL DEFAULT '[]'::jsonb,
    mfa_required    BOOLEAN NOT NULL DEFAULT TRUE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_active   ON users(active);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(lower(username));

-- Sesiones / refresh tokens
CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    user_agent    TEXT,
    ip_address    INET,
    UNIQUE (user_id, refresh_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
    ON sessions(user_id) WHERE revoked_at IS NULL;

-- Usuario seed para PoC. Password = "demo_changeme" (argon2).
-- Generado con: argon2 demo_changeme -t 3 -m 12 -p 1 (forma simplificada).
INSERT INTO users (username, full_name, email, password_hash, role_id, mfa_required)
SELECT
    'operador_demo',
    'Operador Demo',
    'operador@cupula.local',
    '$argon2id$v=19$m=4096,t=3,p=1$ZGVtb19zYWx0$dGVzdHRlc3R0ZXN0dGVzdA',
    r.id,
    FALSE
FROM roles r WHERE r.name = 'OPS_OFFICER'
ON CONFLICT (username) DO NOTHING;
