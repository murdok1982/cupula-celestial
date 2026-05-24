"""Tests negativos: intentos de saltarse OPA (geofence, confidence, IFF)."""
from __future__ import annotations

import os
import httpx
import pytest

OPA_URL = os.environ.get("OPA_URL", "http://localhost:8181")


def _evaluate(rule: str, input_data: dict) -> dict:
    r = httpx.post(f"{OPA_URL}/v1/data/{rule}", json={"input": input_data}, timeout=10)
    r.raise_for_status()
    return r.json()


def test_engagement_in_protected_geofence_denied():
    inp = {
        "track": {"lat": 40.4168, "lon": -3.7038, "confidence": 0.99},  # Madrid centro
        "classification": "HOSTILE_CONFIRMED",
        "in_military_zone": False,
        "near_civilian": True,
        "independent_sensor_sources": 2,
        "operator_role": "JEFE_FUEGO",
        "mfa_satisfied": True,
    }
    res = _evaluate("cupula/roe/engagement_authorized", inp)
    assert res.get("result") is False, f"Engagement en geofence civil aceptado: {res}"


def test_engagement_below_threshold_denied():
    inp = {
        "track": {"confidence": 0.50},
        "classification": "HOSTILE_CONFIRMED",
        "in_military_zone": True,
        "independent_sensor_sources": 1,
        "operator_role": "JEFE_FUEGO",
        "mfa_satisfied": True,
    }
    res = _evaluate("cupula/roe/engagement_authorized", inp)
    assert res.get("result") is False


def test_iff_friendly_denied():
    inp = {
        "track": {"confidence": 0.99},
        "classification": "HOSTILE_CONFIRMED",
        "iff_response": "FRIEND",
        "operator_role": "JEFE_FUEGO",
        "mfa_satisfied": True,
    }
    res = _evaluate("cupula/roe/engagement_authorized", inp)
    assert res.get("result") is False, "IFF FRIEND aceptado para engagement"


@pytest.mark.skip(reason="Requiere OPA running; útil en CI con compose up")
def test_opa_reachable():
    r = httpx.get(f"{OPA_URL}/health")
    assert r.status_code == 200
