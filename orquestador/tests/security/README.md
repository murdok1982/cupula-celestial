# Tests negativos de seguridad — Cúpula Celestial FASE 2

Suite de tests de penetración deliberada. Cada test debe **FALLAR si la
defensa correspondiente está rota**.

## Ejecutar

```bash
cd cupula-celestial/orquestador
# Stack arriba (asume hmi-gateway en 8080, sensor-ingest 9000, swarm 9200 interno)
make up

# Ejecutar suite completa
pytest tests/security -v

# Subset:
pytest tests/security/test_auth_bypass.py -v
```

## Interpretación

| Resultado | Significado |
|---|---|
| ✅ PASS | la defensa está correctamente activa |
| ❌ FAIL | regresión de seguridad — bloquear merge |
| SKIP | servicio no accesible (revisar entorno) |

## Cobertura

| Test | Defensa que valida |
|---|---|
| test_auth_bypass | JWT obligatorio en endpoints sensibles |
| test_jwt_tampering | RS256 signature verification |
| test_opa_bypass | umbrales ROE OPA, geofences, IFF |
| test_replay_attack | mfa_proof single-use (Redis) |
| test_sql_injection | parametrización SQLx/AsyncPG en login y endpoints |
| test_swarm_unauth | HMAC interno en swarm-controller |
| test_sensor_replay | nonce anti-replay en sensor-ingest |
| test_hash_chain_tampering | audit-log integridad de chain + batches |
| test_rate_limit | tower-governor por endpoint |
| test_account_lockout | 5 fallos consecutivos → 423 Locked |

## CI

Estos tests corren en `.github/workflows/tests.yml` como suite obligatoria.
Una regresión bloquea el merge.
