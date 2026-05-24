# Security Audit FASE 2 — Cúpula Celestial — Endurecimiento operacional

> Fecha de cierre: 2026-05-24
> Scope: cierre del checklist gate FASE 1 con mejoras factibles por código.

---

## Resumen ejecutivo

| Mejora | Estado | Notas |
|---|---|---|
| 1. webauthn-rs REAL | ✅ APLICADA | Tabla `webauthn_credentials` + endpoints + counter rollback detection |
| 2. mTLS interno | ✅ APLICADA | CA + certs por servicio + rustls server + reqwest client; documentado SPIFFE/SPIRE para producción |
| 3. SASL_SCRAM + TLS + ACLs Redpanda | 🟡 PARCIAL | Bootstrap.yaml + setup-acls.sh + clientes con SASL config; **ACTIVAR exige cambiar `command:` del container Redpanda (queda como switch env)** |
| 4. HSM abstracción + SoftHSM | ✅ APLICADA | Trait `HsmSigner` + SoftHSM Ed25519 + PKCS#11 stub (pendiente hardware) |
| 5. Sandbox seccomp + AppArmor | ✅ APLICADA | Perfiles + integración compose; AppArmor solo aplicable en hosts Linux |
| 6. Firma OTA modelos VLM | ✅ APLICADA | `SignedModelLoader` + `sign_model.py` + tests roundtrip; integrado en Stage1/2 |
| 7. SBOM + CI dependency scanning | ✅ APLICADA | 3 workflows GitHub Actions + cargo-deny + pre-commit hooks |
| 8. Tests negativos de seguridad | ✅ APLICADA | 10 archivos en `tests/security/` con READMEs |
| 9. Plan PQC + stub funcional | ✅ APLICADA | `docs/PQC_MIGRATION_PLAN.md` + `crypto/pqc.rs` con Kyber+Dilithium feature-gated |
| 10. Métricas + observabilidad | ✅ APLICADA | Endpoints `/metrics`, Prometheus + Grafana + docs SLI/SLO |
| 10. Logs estructurados | ✅ APLICADA | Docs `LOGGING.md`; servicios ya usaban tracing+OTEL |
| 10. Runbook + IR | ✅ APLICADA | `RUNBOOK.md` + `INCIDENT_RESPONSE.md` |
| 10. Reproducible builds | 🟡 PARCIAL | Nix flake esqueleto; build hermetic completo pendiente |

Estado del **gate FASE 2**: **PASA con 2 PARCIALES no-bloqueantes** (Redpanda SASL
y Nix builds). Recomendación: avanzar a FASE 3 con un sprint de hardening
final para activarlos en producción.

---

## Detalle por mejora

### 1. webauthn-rs REAL — H-CRIT-002 cierre definitivo

**Archivos**:
- `orquestador/services/hmi-gateway/Cargo.toml`: deps `webauthn-rs = 0.5`, `url`, `base64`.
- `orquestador/services/hmi-gateway/src/auth/webauthn.rs`: reescrito con
  `WebauthnService` (start/finish registration/authentication).
- `orquestador/services/hmi-gateway/src/main.rs`: 4 endpoints nuevos
  (`/auth/webauthn/register/{begin,finish}`, `/auth/webauthn/authenticate/{begin,finish}`).
- `orquestador/migrations/006_webauthn_credentials.sql`: tablas `webauthn_credentials`
  y `webauthn_states`.
- `Fido2Outcome::RejectedCounterRollback` y `UseWebauthnFlow` añadidos.
- `FIDO2_REAL_VERIFY` default cambia a `true`.

**Counter rollback detection**: si `new_counter ≤ stored_counter` (excepto ambos = 0),
la credencial se cuarentena con counter centinela max y se devuelve
`RejectedCounterRollback`. Métrica Prometheus expone esto.

**Tests**:
- `webauthn::tests::webauthn_service_builds_from_env`
- `webauthn::tests::webauthn_service_rejects_bad_origin`

**Validar**:
```bash
cargo test -p hmi-gateway webauthn
# Flujo manual:
curl -X POST http://localhost:8080/auth/webauthn/register/begin \
  -H "Content-Type: application/json" \
  -d '{"username":"operador_demo","display_name":"Operador Demo"}'
```

### 2. mTLS interno

**Archivos**:
- `orquestador/mtls/ca.cnf`, `service.cnf.tmpl`, `generate_mtls_certs.sh`.
- `orquestador/services/hmi-gateway/src/crypto/tls.rs` — helper rustls.
- `orquestador/services/audit-log/src/main.rs` — soporte TLS en server.
- `docker-compose.yml` — todos los servicios montan `./mtls/certs:/run/mtls:ro`.
- `docs/MTLS_GUIDE.md` — rotación y plan SPIFFE/SPIRE futuro.

**Comportamiento**: si `TLS_CERT_PATH`/`TLS_KEY_PATH` no apuntan a archivos
existentes, el servicio arranca plaintext (compatibilidad dev). Si existen,
arranca con rustls + opcionalmente verifica cliente (`MTLS_REQUIRE_CLIENT_CERT`).

**Validar**:
```bash
cd orquestador/mtls && ./generate_mtls_certs.sh
docker compose up -d
# El log de cada servicio debería decir "mTLS habilitado"
```

### 3. SASL_SCRAM + TLS + ACLs Redpanda — PARCIAL

**Archivos**:
- `orquestador/redpanda/bootstrap.yaml` — superuser + lista de usuarios.
- `orquestador/redpanda/setup-acls.sh` — script de provisioning ACLs.
- Clientes Rust: `apply_kafka_sasl_config()` en `audit-log/src/main.rs` (referencia).
  Mismo patrón aplicable a `hmi-gateway`, `sensor-ingest`, `track-fusion`, `swarm-controller`.

**Por qué PARCIAL**: activar SASL en el container Redpanda requiere modificar
`command:` del compose para añadir `--set redpanda.enable_sasl=true --set
redpanda.kafka_api_tls.enabled=true`, generar certs en
`redpanda/certs/redpanda.{crt,key}` y desplegar `bootstrap.yaml`. Hicimos los
artefactos preparatorios pero NO activamos el cambio del compose porque rompería
arranques dev sin certs. Procedimiento:

```bash
# 1. generar certs Redpanda (re-usa la CA mTLS):
cp orquestador/mtls/certs/{ca.crt,ca.key} orquestador/redpanda/certs/
# generar redpanda.crt firmado por la CA con SAN DNS:redpanda

# 2. activar en compose:
# command:
#   - --set redpanda.enable_sasl=true
#   - --set redpanda.kafka_api_tls.enabled=true
#   - --set redpanda.kafka_api_tls.cert_file=/etc/redpanda/certs/redpanda.crt
#   - --set redpanda.kafka_api_tls.key_file=/etc/redpanda/certs/redpanda.key
#   - --set redpanda.kafka_api_tls.truststore_file=/etc/redpanda/certs/ca.crt
#   - --set redpanda.kafka_api_tls.require_client_auth=true

# 3. ./redpanda/setup-acls.sh

# 4. en .env:
# KAFKA_SECURITY_PROTOCOL=SASL_SSL
# KAFKA_SASL_MECHANISM=SCRAM-SHA-256
```

### 4. HSM abstracción + SoftHSM

**Archivos**:
- `orquestador/services/audit-log/src/hsm/mod.rs` — trait + factory.
- `orquestador/services/audit-log/src/hsm/softhsm.rs` — Ed25519 en disco.
- `orquestador/services/audit-log/src/hsm/pkcs11.rs` — stub PKCS#11.
- `orquestador/migrations/007_audit_batches.sql` — tablas `audit_batches` y `audit_signing_keys`.
- `orquestador/services/audit-log/src/main.rs` — task batch signer cada 30s.

**Comportamiento**: cada 30s o 256 eventos, audit-log calcula
`batch_root = sha256(concat(hashes))`, lo firma con HSM, persiste firma + key_id.
`/v1/verify_chain` ahora verifica también firmas. `/v1/batches` y `/v1/signing_keys`
exponen estado.

**Validar**:
```bash
docker compose logs audit-log | grep "audit batch signed"
curl -s http://localhost:9300/v1/batches | jq
curl -s http://localhost:9300/v1/signing_keys | jq
curl -s http://localhost:9300/v1/verify_chain | jq '.valid'
```

### 5. Sandbox seccomp + AppArmor

**Archivos**:
- `orquestador/sandbox/seccomp-ollama.json`.
- `orquestador/sandbox/seccomp-decision-engine.json`.
- `orquestador/sandbox/apparmor-decision-engine.conf`.
- `orquestador/sandbox/README.md`.
- `docker-compose.yml`: `security_opt` + `cap_drop:[ALL]` aplicados.

**Limitaciones**: AppArmor profile solo aplicable en hosts Linux. En Windows/Mac
queda como reference. seccomp funciona cross-platform (Docker daemon Linux VM).

### 6. Firma OTA modelos VLM

**Archivos**:
- `edge-llm/pipeline/model_loader.py` — `SignedModelLoader` + `ModelManifest`.
- `edge-llm/scripts/sign_model.py` — CLI para crear bundle firmado.
- `edge-llm/scripts/generate_signing_keys.py` — generación par Ed25519 dev.
- `edge-llm/keys/.gitignore` — bloquea `.key`.
- `edge-llm/keys/README.md` — instrucciones HSM en prod.
- `edge-llm/ota/README.md` — LoRA adapter bundles.
- `edge-llm/tests/test_model_loader.py` — 5 tests (valid, tampered, bad-sig, missing manifest, missing fields).
- Integrado en `stage1_detector.py` y `stage2_classifier.py` (opt-in vía env).
- Stage3 (VLM remoto): documentado que la verificación es server-side.

**Validar**:
```bash
cd edge-llm
python scripts/generate_signing_keys.py
echo "dummy_model_bytes" > /tmp/m.onnx
python scripts/sign_model.py --model /tmp/m.onnx \
    --signing-key edge-llm/keys/dev-signing.key \
    --out-dir /tmp/bundle --name test --version 0.1.0 \
    --train-dataset-hash sha256:dummy --signed-by tests
pytest tests/test_model_loader.py
```

### 7. SBOM + CI

**Archivos**:
- `.github/workflows/security-audit.yml` — cargo-audit, cargo-deny, pip-audit, npm-audit, OWASP Dependency-Check, gitleaks.
- `.github/workflows/sbom-generation.yml` — SBOM CycloneDX por Rust/Python/npm + agregado.
- `.github/workflows/tests.yml` — Rust + Python + OPA + npm.
- `orquestador/.cargo/deny.toml` — licencias whitelisted, advisories deny.
- `.pre-commit-config.yaml` — gitleaks, ruff, cargo-fmt, cargo-clippy.

### 8. Tests negativos de seguridad

**Archivos en `orquestador/tests/security/`**:
- `README.md`, `conftest.py`.
- `test_auth_bypass.py` — JWT obligatorio.
- `test_jwt_tampering.py` — payload tampering, alg=none, alg confusion.
- `test_opa_bypass.py` — geofence, confidence thresholds, IFF.
- `test_replay_attack.py` — mfa_proof single-use.
- `test_sql_injection.py` — 6 payloads SQLi en login/refresh.
- `test_swarm_unauth.py` — HMAC obligatorio (skip salvo intra-network).
- `test_sensor_replay.py` — nonce + timestamp anti-replay.
- `test_hash_chain_tampering.py` — verify_chain + batches + signing_keys.
- `test_rate_limit.py` — login burst → 429.
- `test_account_lockout.py` — 5 fallos → 423.

### 9. Plan PQC

**Archivos**:
- `docs/PQC_MIGRATION_PLAN.md` — roadmap 12 meses, 4 fases.
- `orquestador/services/hmi-gateway/src/crypto/pqc.rs` — Kyber768 KEM + Dilithium3 sign con tests roundtrip.
- Feature `pqc-hybrid` en `Cargo.toml` (off por defecto).

**Validar**:
```bash
cd orquestador/services/hmi-gateway
cargo test --features pqc-hybrid pqc
```

### 10. Mejoras operativas

#### a) Métricas Prometheus
- `orquestador/services/hmi-gateway/src/metrics.rs` con `/metrics`.
- audit-log expone counters básicos en `/metrics`.
- Prometheus + Grafana en `docker-compose.yml`.
- `orquestador/observability/prometheus.yml` con scrape configs.
- Dashboard preconfigurado en `observability/grafana/provisioning/dashboards/`.
- `docs/OBSERVABILITY.md` con SLI/SLO.

#### b) Backpressure / graceful shutdown
- hmi-gateway: `axum-server` con `tokio::signal::ctrl_c()`.
- audit-log: idem.
- Backpressure en sensor-ingest: ya existía rate-limit governor 10k/min.

#### c) Reproducible builds
- `orquestador/flake.nix` esqueleto Nix.
- `docs/REPRODUCIBLE_BUILDS.md`.

#### d) Logs JSON + correlación
- `docs/LOGGING.md`.

#### e) Documentación operacional
- `docs/RUNBOOK.md`.
- `docs/INCIDENT_RESPONSE.md`.

---

## Pendientes externos (fuera de scope técnico de este sprint)

| Item | Razón | Sustituto temporal |
|---|---|---|
| HSM hardware (YubiHSM2 / Thales) | Requiere compra física + certificación FIPS | SoftHSM Ed25519 en disco, PEM 0600 |
| Smart cards FIDO2 hardware | Compra YubiKey FIPS 5C por operador | webauthn-rs acepta cualquier authenticator REAL |
| Diodo de datos ROJA↔VERDE | Hardware Owl/BAE/Nexor + certificación | network Docker `cupula` (no equivalente, sólo lógico) |
| Dataset clasificado VLM | Acceso a Aire / EMAD para grabaciones reales | Modelos públicos firmados con dev key |
| Auditoría CCN-CERT | Proceso oficial con autoridades | Suite tests negativos automatizados |
| Article 36 review (Geneva Conv.) | Asesoría jurídica humana | Plantilla `INCIDENT_RESPONSE.md` con notas legales |
| Activar SASL Redpanda | Cambio compose + certs requiere coordinación deploy | Artefactos listos (bootstrap.yaml, setup-acls.sh) |
| Red Team ejercicio anual | Coordinación CCN-CERT + presupuesto | Suite `tests/security/` ejecutable cuántas veces se quiera |

---

## Compose verificado

Tras los cambios, `docker compose up -d` arranca correctamente:
- Postgres, Redis, Redpanda (plaintext intra-network — SASL queda como switch).
- Servicios Rust + Python con mTLS opcional (sólo activo si certs en `./mtls/certs/`).
- Sandbox seccomp activo en ollama + decision-engine (cross-platform via Docker daemon).
- Prometheus + Grafana arrancan; scrape de los endpoints `/metrics`.
- audit-log genera SoftHSM key automáticamente en primer arranque.

Si los certs mTLS no existen, los servicios arrancan plaintext (mensaje WARN
visible en logs). Esto preserva el flujo dev `make up`.
