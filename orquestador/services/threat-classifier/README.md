# threat-classifier

Servicio Python (FastAPI) que clasifica tracks confirmados en una de las categorías:
`UNKNOWN | BIRD | CIVIL | MIL_FRIEND | MIL_NEUTRAL | THREAT_PROBABLE | HOSTILE_CONFIRMED`.

## Pipeline ensemble

```
features ─┬─→ CNN micro-Doppler   ┐
          ├─→ EfficientNet EO/IR  ├─→ stacking → score
          ├─→ MLP firma RF        │
          └─→ Reglas físicas      ┘
```

Pesos PoC: reglas 45%, doppler 20%, eoir 20%, rf 15%.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/health` | Liveness |
| POST   | `/v1/classify` | Clasifica un track |
| POST   | `/v1/classify_batch` | Clasifica lote |

## Ejemplo curl

```bash
curl -s http://localhost:8001/v1/classify -H "Content-Type: application/json" -d '{
  "track_id": "T-test1234",
  "timestamp": "2026-05-22T10:00:00Z",
  "speed_mps": 55,
  "altitude_agl_m": 250,
  "rcs_dbsm": -15,
  "doppler_mps": 25,
  "micro_doppler_period_ms": 18,
  "spectrum_signature": "OcuSync_v3",
  "has_iff_response": false,
  "in_known_corridor": false,
  "sensors": ["RADAR_AESA", "RF_SPECTRUM"]
}'
```

## Kafka

Subscribe: `tracks.confirmed`
Publish:   `tracks.classified`

## Tests

```bash
pip install -e ".[dev]"
pytest -q
```

## STUB

Si los `.onnx` no están presentes (artefactos placeholder), el ensemble cae a las reglas
deterministas (auditables). El sistema sigue funcional para el demo.
