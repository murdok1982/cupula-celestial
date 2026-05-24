# Plan de Respuesta a Incidentes — Cúpula Celestial

> Marco NIST SP 800-61r2 adaptado a sistema C2 anti-UAS.
> Estado: FASE 2 — para validación final por CCN-CERT.

## Clasificación de incidentes

| Severidad | Ejemplos | RTO/RPO |
|---|---|---|
| **CRÍTICO** | RCE en hmi-gateway, audit-log tampered, key HSM exfiltrada, OPA bypass, engagement no autorizado ejecutado | RTO < 30min |
| **ALTO** | Login bruteforce >100 IP/min, JWT key leak, mTLS handshake fail masivo | RTO < 2h |
| **MEDIO** | Rate-limit violations > 1k/h, sensor HMAC mismatch ráfaga, OPA decision logs sospechosos | RTO < 8h |
| **BAJO** | Alertas Prometheus no críticas, certs próximos a expirar | RTO < 7d |

## Fases (NIST)

### 1. Preparación
- [x] Runbook (`RUNBOOK.md`) actualizado.
- [x] Logs JSON + correlation_id (W3C TraceContext) propagado entre microservicios.
- [x] Audit-log con cadena Merkle + firmas Ed25519 HSM-backed.
- [x] Métricas Prometheus + dashboards Grafana.
- [ ] **PENDIENTE**: Acuerdo con CCN-CERT, plantillas de notificación CSIRT.
- [ ] **PENDIENTE**: Contacto 24/7 con vendor Thales/Yubico para HSM tampering.

### 2. Detección y análisis

#### Indicadores de compromiso (IoC)
1. `cupula_login_attempts_total{result="failed"}` > 50/min from single IP.
2. `cupula_engagement_authorize_total{result="forbidden_role"}` súbito.
3. `cupula_webauthn_outcomes_total{outcome="RejectedCounterRollback"}` > 0
   → **CRÍTICO**: posible authenticator clonado.
4. `/v1/verify_chain` devuelve `valid:false`.
5. Logs OPA con `decision_logs` rechazando engagements en cascada (posible
   poisoning de input).

#### Triage
```bash
# 1. snapshot logs (últimas 24h)
docker compose logs --since 24h --no-color > /tmp/logs-$(date +%s).log

# 2. snapshot audit-log
curl -s http://localhost:9300/v1/events?limit=500 > /tmp/audit-$(date +%s).json

# 3. verificar integridad
curl -s http://localhost:9300/v1/verify_chain > /tmp/chain-$(date +%s).json
```

### 3. Contención

#### Inmediata
```bash
# Bloquear acceso externo al HMI sin parar el bus (preserva audit)
docker compose stop hmi-operador hmi-gateway
# Bus + audit + drones siguen activos para no perder reconocimiento
```

#### Contención específica de credenciales
```bash
# Revocar TODOS los refresh tokens de un usuario
docker compose exec postgres psql -U cupula -d cupula -c \
    "UPDATE sessions SET revoked_at = now() WHERE user_id = '<UUID>';"

# Blacklist global de JWTs (todos los issued antes de ts)
# Implementado en hmi-gateway: variable JWT_NBF_FLOOR (epoch seconds)
docker compose exec hmi-gateway env JWT_NBF_FLOOR=$(date +%s) [...]
```

### 4. Erradicación

| Tipo incidente | Acción |
|---|---|
| Credencial comprometida | Rotar password + invalidar refresh + reset failed_attempts |
| HSM key comprometida | Rotar clave HSM (ver RUNBOOK) + re-firmar batches |
| mTLS cert leak | Regenerar cert servicio + rotar CA si aplica (ver MTLS_GUIDE) |
| OPA policy bypass | Patch policy + redespliegue + reauditar decisiones |
| Container escape | Patch base image + rebuild + verificar AppArmor + seccomp |

### 5. Recuperación

```bash
# 1. validar integridad pre-recovery
curl http://localhost:9300/v1/verify_chain | jq '.valid' # debe ser true

# 2. arranque progresivo
docker compose up -d postgres redis redpanda    # infra primero
sleep 30
docker compose up -d audit-log policy-engine    # críticos
sleep 15
docker compose up -d                             # resto

# 3. smoke tests
pytest orquestador/tests/security -v
pytest orquestador/tests/e2e -v
```

### 6. Lecciones aprendidas

Post-mortem template:

```markdown
# Incident Post-Mortem [YYYY-MM-DD-NN]

## Resumen ejecutivo
[2 párrafos]

## Timeline
- HH:MM (UTC): detección por [Prometheus / report operador / etc]
- HH:MM: triage iniciado por [persona]
- HH:MM: contención aplicada
- HH:MM: erradicación completada
- HH:MM: recovery validado

## Causa raíz
[análisis 5-whys]

## Lo que funcionó
- [x] Métricas Prometheus alertaron en T+30s.
- [x] Audit-log verify_chain detectó tampering.

## Lo que falló
- [ ] [acción correctiva]

## Action items
1. [ ] @owner — fecha — descripción
```

## Contactos (PENDIENTE)

- CCN-CERT 24/7: ⚠️ rellenar con datos reales tras aprobación oficial.
- Vendor HSM (Yubico FIPS): ⚠️ contrato pendiente.
- Vendor SOAR (Splunk SOAR / Cortex XSOAR): ⚠️ no integrado en PoC.

## Cumplimiento legal (PENDIENTE asesoría humana)

- Ley 8/2011 (Protección de Infraestructuras Críticas) — notificación al CNPIC
  en incidentes que afecten capacidades C-UAS.
- RGPD: si hay PII de operadores en logs comprometidos, notificación AEPD < 72h.
- Ley 36/2015 (Seguridad Nacional): incidentes severos al CCN/SECDEFNAC.
