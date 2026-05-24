# Observabilidad — Cúpula Celestial FASE 2

## Stack

| Componente | Rol | Endpoint |
|---|---|---|
| Prometheus | Métricas time-series | http://localhost:9090 |
| Grafana | Dashboards | http://localhost:3001 |
| Jaeger | Distributed tracing | http://localhost:16686 |
| OpenTelemetry | Instrumentación uniforme | OTLP gRPC :4317 |

## Métricas expuestas por servicio

### hmi-gateway (`/metrics`)
- `cupula_login_attempts_total{result}` — counter por resultado (success/failed).
- `cupula_engagement_authorize_total{result}` — autorizaciones.
- `cupula_rate_limit_hits_total{endpoint}` — requests bloqueadas.
- `cupula_jwt_blacklist_hits_total` — JWT rechazados por blacklist.
- `cupula_webauthn_outcomes_total{outcome}` — resultados FIDO2.

### audit-log (`/metrics`)
- `cupula_audit_events_total` — total eventos persistidos.
- `cupula_audit_batches_total` — total batches firmados.

### policy-engine (OPA built-in)
- `opa_decisions_total{decision_id}` — decisiones por path.

## SLI / SLO propuestos

| Servicio | SLI | SLO | Burn-rate alert |
|---|---|---|---|
| hmi-gateway | p95 latency `/auth/login` | < 500ms | 5x normal/15min |
| hmi-gateway | error rate engagement | < 0.1% | 2x normal/1h |
| sensor-ingest | drop rate sensor readings | < 0.01% | 5x normal/5min |
| track-fusion | latency sensor→track | < 200ms p99 | 3x normal/30min |
| decision-engine | OPA decision latency | < 50ms p99 | 5x normal/15min |
| audit-log | batch sign latency | < 1s p99 | 10x normal/30min |
| audit-log | verify_chain freshness | check ≤ 1h | -- |

## SLI sensor-to-shooter (KPI doctrinal)

```promql
# p99 desde sensor reading hasta engagement authorized
histogram_quantile(0.99,
  rate(cupula_sensor_to_shooter_latency_bucket[5m])
)
# Target FASE 2: p99 < 8 segundos (objetivo doctrinal)
```

> Implementación pendiente: el histograma `cupula_sensor_to_shooter_latency`
> debe instrumentarse al finalizar el flujo en swarm-controller (T_engage).

## Logs estructurados

Todos los servicios usan `tracing` (Rust) o `structlog` (Python) con format JSON.
Cada log incluye:
- `timestamp` (ISO 8601 UTC)
- `level`
- `service`
- `trace_id` / `span_id` (W3C TraceContext)
- `correlation_id` (propagado desde request HTTP)

Ejemplo:
```json
{
  "timestamp": "2026-05-24T12:34:56.789Z",
  "level": "INFO",
  "service": "hmi-gateway",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b9c7c989f97918e1",
  "message": "engagement autorizado",
  "rec_id": "rec_xyz",
  "user": "operador_demo"
}
```

## Alertas Prometheus (template)

`orquestador/observability/alerts.yml` (TODO crear):

```yaml
groups:
  - name: cupula-security
    rules:
      - alert: WebAuthnCounterRollback
        expr: increase(cupula_webauthn_outcomes_total{outcome="RejectedCounterRollback"}[5m]) > 0
        labels: { severity: critical }
        annotations:
          summary: "FIDO2 counter rollback detectado — authenticator posiblemente clonado"
      - alert: LoginBruteforce
        expr: rate(cupula_login_attempts_total{result="failed"}[5m]) > 1
        labels: { severity: high }
      - alert: AuditChainBroken
        expr: cupula_audit_chain_valid == 0
        labels: { severity: critical }
```

## Acceso a Jaeger

```bash
open http://localhost:16686
# Filtrar por servicio: hmi-gateway → operation: /auth/login → ver trace.
```

## Pendientes

- [ ] Histograma sensor-to-shooter end-to-end.
- [ ] Alertas Prometheus configuradas (groups en `alerts.yml`).
- [ ] Loki para agregación de logs (sólo Jaeger es para traces).
- [ ] SOAR (Splunk/XSOAR) — fuera de scope PoC.
