-- ===========================================================================
-- Sesiones y revocación de tokens (refuerzos H-ALT-001)
-- ===========================================================================
-- Las tablas base ya están creadas en 004_users_roles.sql. Esta migración
-- añade índices, columnas auxiliares y el rol VIGILANTE/OPERADOR/OFICIAL_TACTICO/JEFE_FUEGO
-- exigidos por la nueva ROE jerárquica (H-CRIT-003).

-- Roles adicionales para la jerarquía completa
INSERT INTO roles (name, description) VALUES
    ('VIGILANTE',       'Vigilante — solo observación, sin autorización'),
    ('OPERADOR',        'Operador estándar — supervisión y reconocimiento'),
    ('OFICIAL_TACTICO', 'Oficial táctico — autoriza engagement con colateral medio'),
    ('JEFE_FUEGO',      'Jefe de fuego — autoriza engagement crítico/protected zone')
ON CONFLICT (name) DO NOTHING;

-- Índice para búsqueda rápida por refresh hash (revocación + lookup)
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_hash
    ON sessions (refresh_token_hash);

-- Columna last_activity_at para auditoría/UX
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- Index por user_id+revoked para listados de sesiones activas
CREATE INDEX IF NOT EXISTS idx_sessions_user_revoked
    ON sessions (user_id, revoked_at);

-- ===========================================================================
-- NOTA OPERATIVA
-- ===========================================================================
-- El hash de la password del usuario 'operador_demo' incrustado en la
-- migración 004 es un placeholder (Argon2 m=4096). El servicio hmi-gateway,
-- al arrancar, detecta ese placeholder y lo reseed con parámetros OWASP
-- (m=65536, t=3, p=4) usando la función `ensure_demo_password_argon2_owasp`.
-- Para regenerar manualmente desde host:
--   docker compose exec hmi-gateway hmi-gateway --reseed
-- (no implementado en CLI todavía; el reseed automático cubre el PoC).
