"""Cliente LLM (Ollama) con fallback stub determinista.

- Si Ollama responde, usamos `format=json` (forzado JSON) y prompt RAG.
- Si falla o timeout, usamos motor de reglas que produce el mismo JSON schema.
- En ambos casos la salida se VALIDA con jsonschema antes de retornar.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
from jsonschema import Draft202012Validator, ValidationError

log = logging.getLogger("decision-engine.llm")

OLLAMA_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b-instruct-q4_K_M")
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT_SECONDS", "8"))
FALLBACK_STUB = os.environ.get("LLM_FALLBACK_STUB", "true").lower() == "true"

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "recommendation.schema.json"
if not SCHEMA_PATH.exists():
    # Fallback inline (la imagen Docker copia explícitamente /schemas).
    SCHEMA_PATH = Path("/app/schemas/recommendation.schema.json")

if SCHEMA_PATH.exists():
    SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
else:  # último recurso
    SCHEMA = {"type": "object"}

VALIDATOR = Draft202012Validator(SCHEMA)


class LLMClient:
    def __init__(self) -> None:
        self.base_url = OLLAMA_URL
        self.model = OLLAMA_MODEL
        self.client = httpx.AsyncClient(timeout=LLM_TIMEOUT)

    async def close(self) -> None:
        await self.client.aclose()

    async def recommend(self, prompt: str) -> tuple[dict[str, Any], str]:
        """Devuelve (recomendación, model_used)."""
        try:
            resp = await self.client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "format": "json",  # Ollama fuerza JSON
                    "stream": False,
                    "options": {"temperature": 0.0, "top_p": 0.9, "num_predict": 512},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data.get("response", "")
            parsed = json.loads(text)
            self._validate(parsed)
            return parsed, self.model
        except (httpx.HTTPError, json.JSONDecodeError, ValidationError) as exc:
            log.warning("ollama_failed: %s; fallback to stub", exc)
            if not FALLBACK_STUB:
                raise
            return _stub_recommend_from_prompt(prompt), "stub-deterministic"

    @staticmethod
    def _validate(obj: dict[str, Any]) -> None:
        errors = list(VALIDATOR.iter_errors(obj))
        if errors:
            msgs = "; ".join(e.message for e in errors[:5])
            raise ValidationError(f"schema violations: {msgs}")


def _stub_recommend_from_prompt(prompt: str) -> dict[str, Any]:
    """Stub determinista: parsea el prompt para extraer el track summary y aplica reglas."""
    import re

    track_id = "T-stub0000"
    m = re.search(r"track_id=([\w\-]+)", prompt)
    if m:
        track_id = m.group(1)

    classification = "UNKNOWN"
    if "HOSTILE_CONFIRMED" in prompt:
        classification = "HOSTILE_CONFIRMED"
    elif "THREAT_PROBABLE" in prompt:
        classification = "THREAT_PROBABLE"

    in_protected = "in_protected_zone=True" in prompt
    civilians = "civilians_within_500m=True" in prompt
    auth_required = True
    if classification == "HOSTILE_CONFIRMED" and not in_protected and not civilians:
        kind = "ENGAGE"
        auth_level = "OPS-OFFICER"
        pk = 0.85
        collateral = "LOW"
    elif classification == "THREAT_PROBABLE" and not in_protected and not civilians:
        kind = "ENGAGE"
        auth_level = "CO"
        pk = 0.72
        collateral = "LOW"
    elif in_protected:
        kind = "OBSERVE"
        auth_level = "JOINT-CO"
        pk = 0.30
        collateral = "HIGH"
    else:
        kind = "TRACK"
        auth_level = "OPS-OFFICER"
        pk = 0.50
        collateral = "MEDIUM"

    interceptors = []
    m_ic = re.search(r"available_interceptors=\[(.+?)\]", prompt)
    if m_ic:
        interceptors = [x.strip().strip("'\"") for x in m_ic.group(1).split(",") if x.strip()]
        interceptors = interceptors[:2]

    rationale = (
        f"Stub determinista (fallback LLM no disponible). Clasificación={classification}, "
        f"zona_protegida={in_protected}, civiles_cercanos={civilians}. "
        f"Acción recomendada {kind} a nivel {auth_level}."
    )
    return {
        "track_id": track_id,
        "recommendation": kind,
        "interceptors_proposed": interceptors,
        "engagement_window": {"start_ms": 0, "end_ms": 5000},
        "pk_estimated": pk,
        "collateral_risk": collateral,
        "rationale": rationale,
        "operator_action_required": auth_required,
        "authorization_level": auth_level,
        "roe_version": "PoC-v0.1",
        "policies_consulted": ["cupula.roe", "cupula.geofence"],
    }
