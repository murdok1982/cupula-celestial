# Tests de integración — Cúpula Celestial

Suite de tests que validan el flujo completo de datos entre servicios del
orquestador C2.

## Requisitos

- Stack Cúpula Celestial en ejecución: `make up`
- Python 3.10+ con dependencias: `pip install httpx pytest`
- Opcional: `pip install docker` para test de failover

## Ejecutar

```bash
# Todos los tests de integración
pytest tests/integration -v

# Test específico
pytest tests/integration/test_sensor_to_track.py -v

# Saltar tests que requieren stack completo (usan mocks)
pytest tests/integration -v -k "not kafka_failover"
```

## Cobertura

| Test | Pipeline | Dependencias externas |
|------|----------|----------------------|
| `test_sensor_to_track` | sensor-ingest → track-fusion | Redpanda, Postgres |
| `test_track_to_recommendation` | track-fusion → threat-classifier → decision-engine | Mock OPA HTTP |
| `test_engagement_flow` | Autorización completa: HMI → audit-log → swarm | Redpanda, Postgres |
| `test_mtls_handshake` | Handshake mTLS entre servicios | Certificados mtls/ |
| `test_kafka_failover` | Degradado si Kafka/Redpanda cae | Docker SDK |

## Mockeo de dependencias

Para tests que no requieren el stack completo, usar mocks HTTP:

```python
# Mock OPA para test_track_to_recommendation
# El fixture mock_opa_server levanta un servidor HTTP en puerto efímero
# y asigna DECISION_ENGINE_URL apuntando a él.
```

## CI

Estos tests corren en `.github/workflows/tests.yml` como suite de integración.
Si un test falla por infraestructura (servicio no disponible), se marca como
`skipped`, no como `failed`.
