# decision-engine

Genera **recomendaciones de engagement** combinando:

- **OPA (policy-engine)** — evalúa ROE/Geofences/Authorization
- **RAG sobre `rag_corpus/`** — doctrina, TTPs, DIH
- **LLM táctico** (Ollama, `qwen2.5:7b-instruct-q4_K_M` por defecto)
- **JSON Schema enforcement** — validación estricta con `jsonschema`
- **Post-validation determinista** — si OPA deniega, override a `OBSERVE`

## Salida garantizada

```json
{
  "track_id": "T-...",
  "recommendation": "OBSERVE|TRACK|WARN|ENGAGE|ABORT",
  "interceptors_proposed": ["I-...", ...],
  "engagement_window": {"start_ms": 0, "end_ms": 4200},
  "pk_estimated": 0.0-1.0,
  "collateral_risk": "NEGLIGIBLE|LOW|MEDIUM|HIGH",
  "rationale": "...",
  "operator_action_required": true,
  "authorization_level": "OPS-OFFICER|CO|JOINT-CO",
  "roe_version": "PoC-v0.1",
  "policies_consulted": ["cupula.roe", ...],
  "llm_model": "qwen2.5:7b-instruct-q4_K_M" | "stub-deterministic"
}
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/health` | Liveness |
| POST   | `/v1/recommend` | Genera recomendación para un track + contexto |

## Modo STUB

Si `LLM_FALLBACK_STUB=true` (por defecto) y Ollama no está disponible o el JSON
del LLM no valida, el servicio genera la recomendación con un motor determinista
(`app/llm/__init__.py::_stub_recommend_from_prompt`). Sigue cumpliendo el schema.

## Kafka

Subscribe: `tracks.classified`
Publish:   `recommendations`

## Tests

```bash
pip install -e ".[dev]"
pytest -q
```
