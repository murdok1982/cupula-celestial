# SPIRE — SPIFFE Identity Federation para Cúpula Celestial

## Objetivo

Sustituir progresivamente el mTLS manual (certificados X.509 por servicio
generados con `generate_mtls_certs.sh`) por identidades SPIFFE gestionadas
por SPIRE, manteniendo compatibilidad hacia atrás durante la transición.

## Arquitectura

```
spire-server (cupula.local)
    ├── spire-agent-hmi    → hmi-gateway workloads
    └── spire-agent-swarm  → swarm-controller workloads

Cada workload recibe un SVID (SPIFFE Verifiable Identity Document)
que puede ser X.509-SVID (compatible con mTLS existente) o JWT-SVID.
```

## Transición gradual desde mTLS manual

| Fase | Autenticación | Certificados |
|------|---------------|--------------|
| 0 (actual) | mTLS manual | `mtls/certs/*.crt` + `ca.crt` |
| 1 | SPIRE + mTLS coexist | Ambos conjuntos de certs montados |
| 2 | Solo SPIRE | SVIDs emitidos por SPIRE server |
| 3 | SPIRE + Federation | Cross-trust con otros dominios |

## Arranque

```bash
# Paso 1: levantar SPIRE server + agentes
make -C spire setup

# Paso 2: verificar healthcheck
make -C spire healthcheck

# Paso 3: generar join tokens (si arranque manual)
make -C spire tokens
```

## Integración con servicios existentes

### Opción A: X.509-SVID (reemplazo directo de mTLS)

Cada servicio lee su SVID del agente SPIRE via Workload API:

```rust
// En lugar de leer TLS_CERT_PATH, TLS_KEY_PATH del filesystem:
let svid = SpiffeSvid::new("/var/lib/spire/agent.sock")
    .await?;
// svid.cert_chain y svid.private_key reemplazan los archivos .crt/.key
```

### Opción B: JWT-SVID (para APIs REST internas)

```rust
let jwt = spiffe::jwt::fetch_svid(
    "/var/lib/spire/agent.sock",
    "spiffe://cupula.local/svc/swarm-controller",
).await?;
// jwt.token se usa como Bearer token
```

## Mapeo de identidades SPIFFE ↔ servicios

| Servicio | SPIFFE ID |
|----------|-----------|
| sensor-ingest | `spiffe://cupula.local/svc/sensor-ingest` |
| track-fusion | `spiffe://cupula.local/svc/track-fusion` |
| swarm-controller | `spiffe://cupula.local/svc/swarm-controller` |
| hmi-gateway | `spiffe://cupula.local/svc/hmi-gateway` |
| audit-log | `spiffe://cupula.local/svc/audit-log` |
| threat-classifier | `spiffe://cupula.local/svc/threat-classifier` |
| decision-engine | `spiffe://cupula.local/svc/decision-engine` |

## Referencia

- [SPIFFE Standard](https://spiffe.io/)
- [SPIRE v1.10 docs](https://spiffe.io/docs/latest/spire-about/)
- [Cúpula Celestial — Seguridad y criptografía](../docs/07-seguridad-criptografia.md)
- [mTLS Guide](../docs/MTLS_GUIDE.md)
- [docs/00-resumen-ideas.md](../docs/00-resumen-ideas.md)
