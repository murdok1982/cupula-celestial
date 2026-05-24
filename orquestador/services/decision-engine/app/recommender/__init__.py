"""Pipeline de recomendación: OPA → RAG → LLM → validación JSON."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import httpx

from app.llm import LLMClient
from app.models import RecommendRequest, Recommendation
from app.wta import heuristic_select

log = logging.getLogger("decision-engine.recommender")

OPA_URL = os.environ.get("OPA_URL", "http://policy-engine:8181")

RAG_DIR = Path(__file__).resolve().parents[2] / "rag_corpus"


class OpaClient:
    def __init__(self) -> None:
        self.client = httpx.AsyncClient(timeout=3.0)

    async def close(self) -> None:
        await self.client.aclose()

    async def eval_roe(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            r = await self.client.post(f"{OPA_URL}/v1/data/cupula/roe", json={"input": payload})
            r.raise_for_status()
            return r.json().get("result", {})
        except Exception as exc:  # noqa: BLE001
            log.warning("opa_failed: %s; usando default 'engagement_authorized=false'", exc)
            return {
                "engagement_authorized": False,
                "authorization_level": "JOINT_CO",
                "collateral_risk": "HIGH",
                "reasons": ["OPA no disponible"],
            }


def _load_rag() -> str:
    if not RAG_DIR.exists():
        return ""
    chunks = []
    for p in sorted(RAG_DIR.glob("*.md")):
        chunks.append(f"\n### {p.stem}\n{p.read_text(encoding='utf-8')}")
    # Truncar para no inflar el contexto
    return "\n".join(chunks)[:6000]


def _build_prompt(req: RecommendRequest, opa: dict[str, Any]) -> str:
    rag = _load_rag()
    return f"""[SYSTEM]
Eres un asistente táctico del sistema antiaéreo Cúpula Celestial. NUNCA tomas decisiones letales:
sólo emites recomendaciones para el operador humano (Meaningful Human Control).
Tu salida DEBE ser un único objeto JSON que cumpla el schema indicado.

[ROE_OPA_OUTPUT]
engagement_authorized={opa.get("engagement_authorized")}
authorization_level={opa.get("authorization_level")}
collateral_risk={opa.get("collateral_risk")}
reasons={opa.get("reasons")}

[DOCTRINA_Y_TTPS]
{rag}

[TRACK]
track_id={req.track.track_id}
classification={req.track.classification}
confidence={req.track.confidence:.3f}
position=({req.track.latitude:.5f},{req.track.longitude:.5f})
altitude_agl_m={req.track.altitude_agl_m:.0f}
speed_mps={req.track.speed_mps:.1f}
tti_seconds={req.track.tti_seconds:.1f}
iff_status={req.track.iff_status}

[CONTEXT]
alert_level={req.context.alert_level}
in_protected_zone={req.context.in_protected_zone}
civilians_within_500m={req.context.civilians_within_500m}
available_interceptors={req.context.available_interceptors}

[SCHEMA_OUTPUT]
{{
 "track_id": str,
 "recommendation": "OBSERVE"|"TRACK"|"WARN"|"ENGAGE"|"ABORT",
 "interceptors_proposed": [str,...],
 "engagement_window": {{"start_ms": int, "end_ms": int}},
 "pk_estimated": 0..1,
 "collateral_risk": "NEGLIGIBLE"|"LOW"|"MEDIUM"|"HIGH",
 "rationale": str (10..1024 chars),
 "operator_action_required": bool,
 "authorization_level": "OPS-OFFICER"|"CO"|"JOINT-CO"
}}

Si engagement_authorized=False (según OPA), la recomendación NO puede ser ENGAGE.
Genera ahora el JSON, sin texto adicional.
"""


def _opa_input_from_req(req: RecommendRequest) -> dict[str, Any]:
    return {
        "track": {
            "track_id": req.track.track_id,
            "classification": req.track.classification,
            "confidence": req.track.confidence,
            "altitude_agl_m": req.track.altitude_agl_m,
            "speed_mps": req.track.speed_mps,
            "tti_seconds": req.track.tti_seconds,
            "position": {"lat": req.track.latitude, "lon": req.track.longitude},
        },
        "context": {
            "alert_level": req.context.alert_level,
            "in_protected_zone": req.context.in_protected_zone,
            "civilians_within_500m": req.context.civilians_within_500m,
            "iff_status": req.track.iff_status,
        },
        "operator": {"role": "OPS_OFFICER"},
    }


def _post_validate(rec: dict[str, Any], opa: dict[str, Any]) -> dict[str, Any]:
    """Enforcement determinista: aunque el LLM diga ENGAGE, si OPA prohíbe, forzamos OBSERVE."""
    if rec.get("recommendation") == "ENGAGE" and not opa.get("engagement_authorized", False):
        rec["recommendation"] = "OBSERVE"
        rec["operator_action_required"] = True
        rec["rationale"] = (
            "OPA denegó engagement_authorized; override determinista a OBSERVE. "
            "Razones OPA: " + ", ".join(opa.get("reasons", []))
        )
        rec["interceptors_proposed"] = []
        rec["pk_estimated"] = 0.0
    # Alinear authorization_level con OPA
    opa_level = (opa.get("authorization_level") or "OPS_OFFICER").replace("_", "-")
    valid_levels = {"OPS-OFFICER", "CO", "JOINT-CO"}
    if opa_level in valid_levels:
        rec["authorization_level"] = opa_level
    if rec.get("collateral_risk") not in {"NEGLIGIBLE", "LOW", "MEDIUM", "HIGH"}:
        rec["collateral_risk"] = opa.get("collateral_risk", "HIGH")
    return rec


class Recommender:
    def __init__(self) -> None:
        self.llm = LLMClient()
        self.opa = OpaClient()

    async def close(self) -> None:
        await self.llm.close()
        await self.opa.close()

    async def run(self, req: RecommendRequest) -> Recommendation:
        opa_input = _opa_input_from_req(req)
        opa_result = await self.opa.eval_roe(opa_input)
        prompt = _build_prompt(req, opa_result)
        rec_dict, model_used = await self.llm.recommend(prompt)

        # Enforcement determinista
        rec_dict = _post_validate(rec_dict, opa_result)
        rec_dict.setdefault("llm_model", model_used)
        rec_dict.setdefault("policies_consulted", ["cupula.roe", "cupula.geofence"])

        # Si los interceptores propuestos del LLM no están en disponibles, usamos heurística.
        if not rec_dict.get("interceptors_proposed") and rec_dict["recommendation"] == "ENGAGE":
            rec_dict["interceptors_proposed"] = heuristic_select(
                req.context.available_interceptors, target_priority=7
            )

        return Recommendation.model_validate(rec_dict)
