"""Tests negativos: intentos de autorizar engagement sin credenciales válidas."""
from __future__ import annotations

import pytest
import httpx


def _engage_payload():
    return {
        "recommendation_id": "rec_test_001",
        "track_id": "trk_test_001",
        "interceptors": ["drone_1"],
        "target_lat": 40.0,
        "target_lon": -3.0,
        "target_alt_m": 100.0,
        "operator_id": "op_test",
        "mfa_proof": "a" * 64,
        "bearer_token": "INVALID",
    }


def test_engage_without_jwt(hmi_url: str, client: httpx.Client):
    r = client.post(f"{hmi_url}/engagement/authorize", json=_engage_payload())
    assert r.status_code in (400, 401, 422), f"Expected 4xx, got {r.status_code}: {r.text}"


def test_engage_with_random_jwt(hmi_url: str, client: httpx.Client):
    payload = _engage_payload()
    payload["bearer_token"] = (
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIifQ.signaturefake"
    )
    r = client.post(f"{hmi_url}/engagement/authorize", json=payload)
    assert r.status_code in (400, 401)


def test_engage_without_mfa_satisfied():
    """Si el JWT NO tiene mfa_satisfied=true, debe devolver 403."""
    # Este test requiere generar un JWT válido pero sin MFA. Se hace en el
    # test integration; aquí dejamos placeholder estructural.
    pytest.skip("Requiere JWT pre-generado del entorno de tests integration")


def test_unknown_endpoints_return_404(hmi_url: str, client: httpx.Client):
    r = client.post(f"{hmi_url}/admin/grant_root", json={})
    assert r.status_code == 404


def test_options_does_not_leak_internal(hmi_url: str, client: httpx.Client):
    r = client.options(f"{hmi_url}/engagement/authorize")
    # CORS preflight: no debe exponer información sensible en headers
    assert "x-internal-build" not in {k.lower() for k in r.headers.keys()}
