# Logging y Correlación — Cúpula Celestial

## Estándar

Todos los servicios emiten logs JSON estructurados con campos:

| Campo | Tipo | Origen |
|---|---|---|
| `timestamp` | ISO-8601 UTC | runtime |
| `level` | string | INFO/WARN/ERROR/DEBUG |
| `service` | string | OTEL_SERVICE_NAME env |
| `trace_id` | hex 32 | W3C TraceContext (header `traceparent`) |
| `span_id` | hex 16 | W3C TraceContext |
| `correlation_id` | UUID | header `X-Correlation-Id` o auto-generado |
| `message` | string | mensaje libre |
| `error` | string | si aplica |

## Propagación W3C TraceContext

Cada request HTTP entrante:
1. Lee `traceparent` header (formato: `00-<trace-id>-<span-id>-<flags>`).
2. Si no existe, genera nuevo trace_id.
3. Lo propaga a calls downstream (audit-log, swarm-controller, OPA, Ollama).
4. Lo escribe en TODOS los logs del request.

Ejemplo (Rust con `tracing` + `tracing-opentelemetry`):

```rust
use tracing::instrument;

#[instrument(skip(state))]
async fn authorize(
    state: State<AppState>,
    Json(req): Json<AuthorizeReq>,
) -> Response {
    // Cada `tracing::info!` automáticamente incluye trace_id+span_id
    tracing::info!(rec_id = %req.recommendation_id, "engagement requested");
    // ...
}
```

Ejemplo (Python con `structlog`):

```python
import structlog
from opentelemetry import trace

log = structlog.get_logger()
tracer = trace.get_tracer(__name__)

async def authorize(req: AuthorizeRequest):
    with tracer.start_as_current_span("authorize"):
        ctx = trace.get_current_span().get_span_context()
        log = log.bind(
            trace_id=format(ctx.trace_id, "032x"),
            span_id=format(ctx.span_id, "016x"),
        )
        log.info("engagement requested", rec_id=req.recommendation_id)
```

## Niveles

| Nivel | Cuándo usar |
|---|---|
| ERROR | fallos que requieren acción humana |
| WARN | comportamiento anómalo recuperable |
| INFO | eventos operativos importantes (login, engagement, batch sign) |
| DEBUG | detalle para debugging — DESHABILITAR en producción |

## Eventos auditables (siempre INFO+, replicados a audit-log)

- `auth.login.success` / `auth.login.failed`
- `auth.logout`
- `auth.webauthn.registered` / `auth.webauthn.authenticated`
- `engagement.authorized` / `engagement.denied`
- `swarm.command.executed`
- `audit.batch.signed`
- `roe.policy.changed`

## Configuración por entorno

### Producción
```bash
RUST_LOG=info
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### Desarrollo
```bash
RUST_LOG=info,hmi_gateway=debug,audit_log=debug
LOG_LEVEL=DEBUG
LOG_FORMAT=json   # NO pretty para no romper grep/jq
```

## Anti-patterns prohibidos

- ❌ `println!` / `print()` / `console.log` en código de producción.
- ❌ Loguear passwords, JWT tokens completos, refresh tokens, mfa_proof.
- ❌ Loguear PII operador sin necesidad (usar user_id UUID, no email).
- ❌ Logs no estructurados (sin JSON).

## Retención

| Origen log | Destino | Retención |
|---|---|---|
| stdout container | docker logs | 24h (rotation 100MB) |
| Producción | Loki/ELK | 90 días hot, 1 año warm, 7 años cold |
| audit_log table | Postgres | 7 años (PENDIENTE: política tier storage) |

## SIEM integration (PENDIENTE)

Para producción:
- Vector / Fluentbit como agente en cada nodo.
- Salida a Splunk / Elastic / SIEM corporativo.
- Detección de patrones (failed_logins en cascada → trigger SOC ticket).
