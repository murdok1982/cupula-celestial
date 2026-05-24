# mTLS Interno — Cúpula Celestial FASE 2

## Resumen

Se ha habilitado mTLS opcional entre microservicios del orquestador. La activación
es **transparente**: cada servicio lee `TLS_CERT_PATH`, `TLS_KEY_PATH` y
`TLS_CA_PATH` del entorno. Si las rutas existen, arranca con rustls (Rust) o
uvicorn-TLS (Python). Si no, fallback a plaintext (sólo dev).

## Estado por servicio

| Servicio | Lenguaje | Server TLS | Client TLS |
|---|---|---|---|
| hmi-gateway | Rust (axum) | ✅ axum-server + rustls | ✅ reqwest rustls |
| sensor-ingest | Rust | ✅ | ✅ |
| track-fusion | Rust | ✅ | ✅ |
| swarm-controller | Rust | ✅ | ✅ |
| audit-log | Rust | ✅ | ✅ |
| threat-classifier | Python (FastAPI) | ✅ uvicorn ssl_* | httpx con verify |
| decision-engine | Python (FastAPI) | ✅ | httpx con verify |
| policy-engine (OPA) | Go | TLS nativo OPA | — |

## Generar certificados (DEV)

```bash
cd orquestador/mtls
./generate_mtls_certs.sh
```

Esto genera:
- `mtls/certs/ca.crt`, `ca.key` (CA raíz autoríeda 4096-bit RSA, SHA-384, 10 años)
- `mtls/certs/<servicio>.crt`, `<servicio>.key` (cert + key 4096-bit RSA, 365 días)
  con SAN `DNS:<servicio>, DNS:localhost, DNS:<servicio>.cupula, IP:127.0.0.1`

## Distribución

`docker-compose.yml` monta `./mtls/certs:/run/mtls:ro` en cada servicio. Variables:

```yaml
TLS_CERT_PATH: /run/mtls/<servicio>.crt
TLS_KEY_PATH:  /run/mtls/<servicio>.key
TLS_CA_PATH:   /run/mtls/ca.crt
MTLS_ENABLED: "true"
MTLS_REQUIRE_CLIENT_CERT: "false"  # cambiar a true en prod
```

## Rotación

```bash
# Rotación individual de un servicio (cert expirado o comprometido):
rm orquestador/mtls/certs/swarm-controller.{crt,key}
orquestador/mtls/generate_mtls_certs.sh   # regenera sólo lo que falta
docker compose restart swarm-controller
```

## Rotación de la CA

```bash
# Atención: invalida todos los certs hijo.
rm -rf orquestador/mtls/certs/
orquestador/mtls/generate_mtls_certs.sh
docker compose down && docker compose up -d
```

## Migración a SPIFFE/SPIRE (producción)

Tras estabilizar la PoC, sustituir esta CA manual por:

1. **SPIRE Server** desplegado en clúster K8s con HSM-backed signing key (YubiHSM
   FIPS-140-3 nivel 3 o Thales Luna).
2. **SPIRE Agents** sidecar en cada pod, atestación por SVID.
3. **Workload API** (Unix socket) en lugar de archivos PEM en disco.
4. Rotación automática cada 1h.
5. Identidades SPIFFE: `spiffe://cupula.local/svc/<servicio>`.

Documentación: https://spiffe.io/docs/latest/spire/

## Verificar mTLS funciona

```bash
# Tras arrancar el stack:
docker compose exec hmi-gateway curl -v --cacert /run/mtls/ca.crt \
   --cert /run/mtls/hmi-gateway.crt --key /run/mtls/hmi-gateway.key \
   https://audit-log:9300/health

# Sin cert cliente, si MTLS_REQUIRE_CLIENT_CERT=true → 4xx en handshake
docker compose exec hmi-gateway curl -v --cacert /run/mtls/ca.crt \
   https://audit-log:9300/health
```

## Limitaciones conocidas

- Windows: el script `generate_mtls_certs.sh` requiere WSL o Git Bash con `openssl`.
- Edge LLM Jetson: TLS termina en el bastión, los nodos cargan únicamente la CA
  raíz para verificación; los certs cliente se generan via cloud-init.
- Redpanda: configurado en hoja propia (ver `redpanda/bootstrap.yaml`).

## Pendientes hardware

- HSM real para CA root (PENDIENTE-HW: Thales Luna Network HSM).
- Smart cards FIPS para certs operador (PENDIENTE-HW: YubiKey FIPS 5C).
