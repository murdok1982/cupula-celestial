# Orquestador C2 — Cúpula Celestial

PoC del cerebro del sistema antiaéreo. Microservicios que fusionan tracks multisensor,
clasifican amenazas, recomiendan engagement (LLM + WTA) y mantienen un audit-log inmutable.

## Stack

| Servicio | Lenguaje | Función |
|----------|---------|---------|
| `sensor-ingest` | Rust + Axum | Recibe detecciones (HTTP/gRPC) → Kafka |
| `track-fusion` | Rust + nalgebra | Filtro IMM (CV/CA/CT), asociación Auction, M/N confirmation |
| `threat-classifier` | Python + ONNX | Ensemble: micro-Doppler + EO/IR + reglas físicas |
| `decision-engine` | Python + Ollama | LLM táctico con RAG + JSON Schema enforcement |
| `policy-engine` | OPA Rego | ROE, geofences, niveles de autorización |
| `swarm-controller` | Rust + MAVLink2 | WTA (Húngaro/Greedy), comando a drones |
| `hmi-gateway` | Rust + Axum | WebSocket bridge, JWT RS256, FIDO2 stub |
| `audit-log` | Rust | Append-only + cadena Merkle |

## Quick start

```bash
# 1. Variables
cp .env.example .env

# 2. Generar certificados mTLS dev
bash scripts/generate_certs.sh

# 3. Arrancar todo
make up

# 4. Esperar healthchecks (~60s)
make logs

# 5. Demo end-to-end
make simulate
```

## Demo end-to-end

`make simulate` lanza un escenario sintético contra `sensor-ingest`:

1. Sensor simulator emite detecciones radar + RF compatibles con un Shahed-like a 6 km.
2. `track-fusion` fusiona y publica `tracks.confirmed`.
3. `threat-classifier` etiqueta como `AMENAZA_PROBABLE` (confianza 0.87).
4. `decision-engine` consulta OPA (ROE-7 permite), consulta LLM, produce JSON validado.
5. `hmi-gateway` recibe `recommendations` y lo emite por WS.
6. Test e2e `tests/e2e/test_demo.py` autoriza vía HTTP, observa orden MAVLink.
7. `audit-log` registra toda la cadena.

## Topología Kafka

| Topic | Productor | Consumidor |
|-------|-----------|------------|
| `sensors.raw` | `sensor-ingest` | `track-fusion` |
| `tracks.confirmed` | `track-fusion` | `threat-classifier`, `decision-engine`, `hmi-gateway`, `audit-log` |
| `tracks.classified` | `threat-classifier` | `decision-engine`, `audit-log` |
| `recommendations` | `decision-engine` | `hmi-gateway`, `audit-log` |
| `engagement.authorized` | `hmi-gateway` | `swarm-controller`, `audit-log` |
| `engagement.commanded` | `swarm-controller` | `audit-log` |
| `alerts` | varios | `hmi-gateway`, `audit-log` |

## Seguridad

- mTLS entre servicios (`scripts/generate_certs.sh`).
- JWT RS256, access 15 min / refresh 7 días.
- Argon2 para passwords.
- Sin secrets en repo (todo `.env`).
- `serde(deny_unknown_fields)` en Rust, Pydantic v2 estricto en Python.

## Documentación

La doctrina y arquitectura completas están en `../docs/`. Este PoC implementa
fielmente lo descrito en `02-arquitectura-general.md`, `03-orquestador-c2.md`,
`05-sensores-fusion.md` y `09-stack-tecnologico.md`.

## Limitaciones del PoC (marcadas STUB en código)

- LLM táctico: usa Ollama si está disponible; si no, stub determinista por reglas.
- FIDO2: endpoints estructurados pero sin verificación criptográfica real (TODO Fase 1).
- ONNX classifier: artefactos placeholder de 1 KB; el código de inferencia es real
  pero los pesos no son productivos.
- mTLS: certificados dev autofirmados. Producción exige PKI con CCN/CERT.
- Observabilidad: Jaeger sí (OTLP), Loki/Tempo no incluidos (Fase 1).
