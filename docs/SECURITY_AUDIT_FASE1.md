# Security Audit FASE 1 — Cúpula Celestial — Estado de cierre

> Fecha de cierre FASE 1: 2026-05-24
> Fecha de cierre FASE 2 (endurecimiento): 2026-05-24
> Scope: orquestador (Rust + Python + OPA) + hmi-operador Dockerfile.
> Auditoría originaria: 3 CRÍTICOS, 10 ALTOS bloqueantes, mitigaciones MEDIAS opcionales.
>
> Para detalle de las mejoras FASE 2, ver [SECURITY_AUDIT_FASE2.md](SECURITY_AUDIT_FASE2.md).

---

## Resumen ejecutivo

| Severidad | Total | RESUELTO | MITIGADO | PENDIENTE |
|---|---|---|---|---|
| CRÍTICO | 3 | 3 | 0 | 0 |
| ALTO bloqueante | 10 | 9 | 1 | 0 |
| MEDIO | 6 abordados | 6 | 0 | — |
| BAJO | 2 abordados | 2 | 0 | — |

Gate FASE 1: **PASA** con condiciones — operar SÓLO como PoC (banner `⚠️ POC NO APTO PARA OPERACIÓN REAL — STUBS ACTIVOS: FIDO2=STUB_POC`).

---

## CRÍTICOS

### H-CRIT-001 — swarm-controller acepta comandos MAVLink sin autenticación → **RESUELTO**

- Middleware `auth::require_internal_auth` aplicado a `/v1/command/engage`, `/v1/command/abort`, `/v1/wta/assign`.
- Acepta dos modos (cualquiera válido):
  - **HMAC-SHA256** con clave compartida `INTERNAL_SVC_HMAC_KEY` (header `X-Internal-Auth`).
  - **JWT RS256** firmado por hmi-gateway, validando `iss`/`aud`/`mfa_satisfied`/rol jerárquico.
- `command_engage` además: valida coordenadas (`-90..90`/`-180..180`/`alt>=0`) y consulta `audit-log /v1/events?event_type=ENGAGEMENT.AUTHORIZED` para confirmar que `authorization_id` consta en la cadena.
- `docker-compose.yml`: puerto 9200 movido de `ports` a `expose` (no publicado al host).
- Tests: `services/swarm-controller/tests/test_auth.rs` cubre 401 sin auth, 401 HMAC inválido, 409 audit-log no encuentra rec_id, 400 coordenadas inválidas.

**Validar**:
```bash
# Sin auth → 401
curl -X POST http://localhost:9200/v1/command/engage -d '{}'   # cuando se reactive el puerto en dev
# o
docker compose exec hmi-gateway curl -sS http://swarm-controller:9200/v1/command/engage \
  -H "Content-Type: application/json" -d '{...}'
```

### H-CRIT-002 — FIDO2 verify completamente bypasseable → **RESUELTO (FASE 1 stub → FASE 2 REAL)**

> Actualizado FASE 2: webauthn-rs REAL implementado. Default `FIDO2_REAL_VERIFY=true`.
> Stub canario sólo activable explícitamente con `false` para tests de regresión.
> Ver `SECURITY_AUDIT_FASE2.md` mejora 1.

- Variable `FIDO2_REAL_VERIFY` (default ahora `true` en FASE 2) en `.env.example`.
- En stub mode `fido2_verify` SÓLO acepta cuando:
  1. `X-PoC-Stub: enabled` header.
  2. `assertion == "POC_STUB_OK"` (canario explícito).
  3. Challenge server-side existe (Redis `fido2:challenge:<user>` TTL 60s).
  4. `challenge_hex` (cliente) coincide con server-side (comparación constant-time).
- Endpoints:
  - `/auth/fido2/begin`: genera challenge 32 bytes hex, almacena en Redis.
  - `/auth/fido2/complete`: consume challenge (GETDEL single-use), valida assertion, emite token MFA-satisfied + nonce `mfa_proof` también single-use.
- Banner de arranque (`tracing::warn!`): `⚠️ FIDO2 STUB ACTIVO — PoC ONLY — NO USE FOR OPERATIONS`.
- Módulo `auth/webauthn.rs` esqueleto con TODOs para implementar webauthn-rs (la dep está documentada como "prep" pero no activada para no introducir 0.5 a medias).
- Test: `services/hmi-gateway/src/auth/mod.rs::tests` cubre 5 negativos + 1 positivo (canario válido).

**Validar**:
```bash
# Stub deshabilitado: rechazo
curl -X POST http://localhost:8080/auth/fido2/complete \
  -H "Content-Type: application/json" \
  -d '{"username":"x","assertion":"foo","challenge_hex":"a".repeat(64)}'
# → 401 RejectedStubDisabled

# Canario aceptado (tras /auth/fido2/begin que graba challenge)
```

### H-CRIT-003 — OPA ROE conflicts + umbrales bajos + escalado privilegios → **RESUELTO**

- `policies/roe.rego` refactorizado:
  - Regla única `engagement_authorized` con composición jerárquica (`deny[...]` corta-circuitos + `classification_clears_threshold`).
  - Umbral HOSTILE_CONFIRMED elevado a **0.90** (default); excepción 0.75 SÓLO si `independent_sensor_sources >= 2` Y `in_military_zone`.
  - `authorization_level` produce `OPS_OFFICER | OFICIAL_TACTICO | JEFE_FUEGO` según contexto (carga letal, civiles, zona protegida).
- `policies/authorization.rego` actualizado con jerarquía completa (VIGILANTE=0…JEFE_FUEGO=4), mantiene legacy (`CO`≡`OFICIAL_TACTICO`).
- `hmi-gateway/authorize`: lee `authorization_level` del request, mapea rol del JWT con `authz::role_rank`, compara con `required_rank`. Rechaza 403 si operador insuficiente.
- Tests:
  - OPA: `services/policy-engine/tests/roe_test.rego` (9 casos: permite/deniega por threshold, IFF, zona protegida, niveles OPS_OFFICER/OFICIAL_TACTICO/JEFE_FUEGO).
  - Rust: `services/hmi-gateway/src/authz.rs::tests` (8 casos jerárquicos).

**Validar**:
```bash
# OPA tests
docker compose exec policy-engine opa test /policies /data /policies/tests
# o desde host con opa CLI
opa test orquestador/services/policy-engine/policies orquestador/services/policy-engine/tests

# Rust tests
cargo test -p hmi-gateway authz
```

---

## ALTOS BLOQUEANTES

### H-ALT-001 — refresh/logout no implementados → **RESUELTO**

- `/auth/refresh`: lee refresh hash, verifica `revoked_at IS NULL` y `expires_at > now`, rota (revoca + emite nuevo).
- `/auth/logout`: extrae JTI del Bearer, lo blacklistea en Redis con TTL=exp restante; opcional: refresh_token a revocar.
- Estructura nueva en `auth/sessions.rs` (hash refresh con SHA-256, `IssuedRefresh`, `SessionRow`).
- Migración 005 añade índice `idx_sessions_refresh_hash`.

### H-ALT-002 — sensor-ingest sin auth → **RESUELTO**

- Middleware `auth::require_sensor_auth` aplicado a `/v1/sensors/reading` y `/v1/sensors/batch`.
- Header: `X-Sensor-Auth: <sensor_id>:<timestamp>:<nonce>:<hmac_hex>`.
- HMAC firma: `sha256_hex(body)` + tupla `(sensor_id, timestamp, nonce)`.
- Tolerancia temporal ±30s. Anti-replay con `SET key NX EX 60` en Redis (`sensor:nonce:<id>:<nonce>`).
- Claves por sensor en `SENSOR_HMAC_KEYS` (JSON).
- Tests en `src/auth/mod.rs::tests`: 3 casos (sin header, sensor desconocido, timestamp viejo).

### H-ALT-003 — Login hardcoded → **RESUELTO**

- `hmi-gateway::login` ahora:
  1. `sessions::find_user_for_login` (BD).
  2. Si no existe → `dummy_password_verify` para constant-time, devuelve 401 genérico.
  3. Si lockout activo → 423 Locked.
  4. `verify_password` Argon2id; si falla, `register_failed_login` (incrementa contador, aplica lockout >= 5).
  5. En éxito: `register_successful_login` (reset contador, set `last_login_at`), emite access+refresh+challenge FIDO2.

### H-ALT-004 — Sin rate-limiting → **RESUELTO**

- `tower-governor` v0.4 aplicado:
  - `/auth/login` 5 req/min/IP
  - `/auth/fido2/*` 10 req/min/IP
  - `/engagement/authorize` 30 req/min/IP
  - `/v1/sensors/reading` y `/batch` 10000 req/min/IP

### H-ALT-005 — Argon2 parámetros < OWASP → **RESUELTO**

- `auth::build_argon2()` → `Params::new(65536, 3, 4, None)` (OWASP 2023).
- `hmi-gateway` al arrancar: `ensure_demo_password_argon2_owasp` detecta hash dummy `m=4096` y lo reseed con OWASP. Idempotente.
- Test: `auth::tests::argon2_owasp_params_roundtrip`.

### H-ALT-006 — Dockerfiles como root → **RESUELTO**

- Todos los Dockerfiles Rust (sensor-ingest, track-fusion, swarm-controller, hmi-gateway, audit-log), Python (threat-classifier, decision-engine) y Jetson (edge-llm) añaden:
  ```dockerfile
  RUN useradd -r -u 10001 -m -d /home/cupula cupula && chown -R cupula:cupula /app
  USER cupula
  ```
- Healthchecks revisados para que el usuario `cupula` pueda ejecutar `wget`/`curl`.

### H-ALT-007 — Postgres password fallback + puerto al host → **RESUELTO**

- `audit-log/src/main.rs`: `DATABASE_URL = std::env::var("DATABASE_URL").map_err(...)?` — falla cerrado si no está.
- `docker-compose.yml`: `postgres`, `redis` y `redpanda` movidos de `ports` a `expose`. Sólo accesibles dentro de la network `cupula`.

### H-ALT-008 — Redis sin AUTH → **RESUELTO**

- `docker-compose.yml`: Redis con `--requirepass ${REDIS_PASSWORD}`.
- `.env.example` documenta `REDIS_PASSWORD` y `REDIS_URL=redis://:<pwd>@redis:6379/0`.

### H-ALT-009 — Kafka plaintext → **MITIGADO**

- Redpanda permanece en plaintext (decisión técnica PoC), pero:
  - Puertos `9092`/`8082` movidos a `expose` (sólo intra-network `cupula`).
  - Comentario explícito en compose: `DEV/PoC ONLY — production requires SASL_SCRAM + TLS + ACLs`.
- Para promoción a producción: ver tarea en `SECURITY_GAPS.md` "Bloqueos para promover".

### H-ALT-010 — Coordenadas reales (OPSEC) → **RESUELTO**

- `geofences.json`: nombres `EJEMPLO_HOSPITAL_A`/`EJEMPLO_EMBAJADA_B`/etc. con offsets sobre Null Island (0,0). Comentario `_warning` explícito.
- `scripts/seed_db.py`: sensores con coords ficticias (`0.0030..0.0050`).
- `tests/e2e/test_demo.py`: `base_lat=0.0040, base_lon=0.0035`.
- `hmi-operador/Dockerfile`: `ARG HMI_GW_HOSTNAME=localhost` parametrizado (sustituye `hmi-gw.cupula.defensa.gob.es`).

---

## MITIGACIONES MEDIAS

| ID | Estado | Implementación |
|---|---|---|
| H-MED-001 (CORS multi-origin) | ✅ | `split(',').filter_map(parse)` en hmi-gateway y sensor-ingest. |
| H-MED-002 (WS token via header) | ✅ | `Sec-WebSocket-Protocol: bearer.<jwt>` soportado en `ws/upgrade`, mantiene compat query. |
| H-MED-007 (Origin allowlist en WS) | ✅ | `origin_allowed` valida `Origin` contra `ALLOWED_ORIGINS` antes de upgrade. |
| H-MED-008 (mfa_proof server-side) | ✅ | Generado en `/auth/fido2/complete`, almacenado Redis `mfa:proof:<user>` TTL 60s, consumido single-use en `/engagement/authorize`. |
| H-MED-009 (security headers) | ✅ | Middleware `security_headers::apply_security_headers` añade HSTS, X-Frame-Options:DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. |

## MITIGACIONES BAJAS

| ID | Estado | Implementación |
|---|---|---|
| H-BAJ-001 (unwrap críticos) | ✅ | `JwtKeys::from_env`, `init_tracing`, `verify_recommendation_exists` con `match`/`?`. Quedan `expect()` con mensaje en arranque (aceptable). |
| H-BAJ-006 (validación lat/lon/alt) | ✅ | `validate_coords` en `swarm-controller::api::command_engage`. |

---

## Pasos para validar localmente

```bash
cd D:/AplicacionesEstatales/cupula-celestial/orquestador
cp .env.example .env
# ajustar secrets (mínimo: REDIS_PASSWORD, INTERNAL_SVC_HMAC_KEY, SENSOR_HMAC_KEYS)

# Generar certs JWT
make certs

# Arrancar stack
make up

# Tests Rust
cargo test --workspace

# Tests OPA
opa test services/policy-engine/policies services/policy-engine/tests

# E2E demo (los puertos 5432, 6379, 9092, 9200 NO están publicados al host)
python tests/e2e/test_demo.py
```

## Checklist gate FASE 2 — Estado final 2026-05-24

- [x] Implementar `webauthn-rs` real (sustituir stub) — H-CRIT-002. **APLICADA**
      → ver `SECURITY_AUDIT_FASE2.md` mejora 1.
- [x] Habilitar mTLS interno (sin SPIFFE/SPIRE: CA propia + rustls).
      **APLICADA**. Plan SPIRE en `MTLS_GUIDE.md`.
- [x] SASL_SCRAM + TLS en Redpanda (artefactos listos, switch en compose).
      **PARCIAL** — activación documentada en `SECURITY_AUDIT_FASE2.md` §3.
- [~] HSM hardware (YubiKey FIPS / TPM 2.0). **PARCIAL — software**:
      SoftHSM Ed25519 + abstracción HsmSigner + PKCS#11 stub.
      Hardware queda como PENDIENTE-HW.
- [ ] Diodo de datos red ROJA↔VERDE. **PENDIENTE-HW** (Owl/BAE/Nexor).
- [x] Firma de firmware y modelos VLM. **APLICADA**:
      `SignedModelLoader` Ed25519 + bundle manifest+sig + scripts.
- [ ] Sustituir catálogo OPSEC `geofences.json` por bundle OPA firmado con
      coordenadas reales clasificadas. **PENDIENTE** — requiere dataset MoD.
- [ ] Red Team ejercicio anual (CCN-CERT). **PENDIENTE** — coordinación oficial.
      Suite `tests/security/` automatizada como sustituto interno.

## Nuevas mejoras de FASE 2 (sin equivalente en FASE 1)

- [x] Sandbox seccomp + AppArmor para LLM táctico.
- [x] SBOM CycloneDX + cargo-deny + pip-audit + pre-commit hooks.
- [x] Tests negativos automatizados de seguridad (10 archivos).
- [x] Plan PQC + stub Kyber768/Dilithium3.
- [x] Métricas Prometheus + Grafana + dashboard preconfigurado.
- [x] Runbook + Incident Response + Logging + Reproducible builds docs.
