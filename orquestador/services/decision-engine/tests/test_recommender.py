"""Tests del decision-engine sin Ollama ni OPA reales (stubs)."""
from __future__ import annotations

import pytest

from app.llm import _stub_recommend_from_prompt
from app.models import ContextInput, RecommendRequest, Recommendation, TrackInput


def _req(**ovr) -> RecommendRequest:
    track = TrackInput(
        track_id=ovr.get("track_id", "T-abc123"),
        classification=ovr.get("classification", "HOSTILE_CONFIRMED"),
        confidence=ovr.get("confidence", 0.9),
        latitude=ovr.get("lat", 40.4),
        longitude=ovr.get("lon", -3.7),
        altitude_agl_m=ovr.get("alt", 300.0),
        speed_mps=ovr.get("speed", 55.0),
        tti_seconds=ovr.get("tti", 30.0),
        iff_status=ovr.get("iff", "NO_RESPONSE"),
    )
    ctx = ContextInput(
        alert_level=ovr.get("alert", "RED"),
        civilians_within_500m=ovr.get("civ", False),
        in_protected_zone=ovr.get("prot", False),
        available_interceptors=ovr.get("ics", ["I-01", "I-02", "I-03"]),
    )
    return RecommendRequest(track=track, context=ctx)


def test_stub_engage_hostile():
    req = _req()
    prompt = (
        f"track_id={req.track.track_id} classification=HOSTILE_CONFIRMED "
        f"in_protected_zone=False civilians_within_500m=False "
        f"available_interceptors=[{', '.join(req.context.available_interceptors)}]"
    )
    rec = _stub_recommend_from_prompt(prompt)
    Recommendation.model_validate(rec)
    assert rec["recommendation"] == "ENGAGE"
    assert rec["authorization_level"] == "OPS-OFFICER"


def test_stub_protected_zone_blocks_engage():
    req = _req(prot=True)
    prompt = (
        f"track_id={req.track.track_id} classification=HOSTILE_CONFIRMED "
        f"in_protected_zone=True civilians_within_500m=False "
        f"available_interceptors=[I-01]"
    )
    rec = _stub_recommend_from_prompt(prompt)
    Recommendation.model_validate(rec)
    assert rec["recommendation"] != "ENGAGE"
    assert rec["authorization_level"] == "JOINT-CO"


def test_stub_civilians_raises_level():
    req = _req(civ=True, classification="THREAT_PROBABLE", confidence=0.75)
    prompt = (
        f"track_id={req.track.track_id} classification=THREAT_PROBABLE "
        f"in_protected_zone=False civilians_within_500m=True "
        f"available_interceptors=[I-01]"
    )
    rec = _stub_recommend_from_prompt(prompt)
    Recommendation.model_validate(rec)
    assert rec["operator_action_required"] is True


def test_validation_rejects_invalid_recommendation():
    bad = {
        "track_id": "T-x",
        "recommendation": "OBLITERATE",  # no permitido
        "interceptors_proposed": [],
        "engagement_window": {"start_ms": 0, "end_ms": 100},
        "pk_estimated": 0.5,
        "collateral_risk": "LOW",
        "rationale": "x" * 30,
        "operator_action_required": True,
        "authorization_level": "OPS-OFFICER",
    }
    with pytest.raises(Exception):
        Recommendation.model_validate(bad)
